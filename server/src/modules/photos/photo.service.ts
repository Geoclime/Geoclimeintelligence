import type { AuthUser } from "../../common/access/auth-user";
import { PermissionResolver } from "../../common/access/permission-resolver";
import { RegionAccess } from "../../common/access/region-access";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../common/errors/app-error";
import { CloudinaryMediaStorage, type IMediaStorage } from "../../common/storage/media-storage";
import { logger } from "../../config/logger";
import { AuditService } from "../audit/audit.service";
import { MEDIA_LIMITS, sniffMedia } from "../flood-reports/media-check";
import { PhotoRepository } from "./photo.repository";
import type { IPhotoRepository, PhotoDto, PhotoSubject, StoredPhotoFile } from "./photo.types";

/** Photos one flood, drain, inspection or place may hold. */
export const MAX_PHOTOS_PER_SUBJECT = 5;
/** The largest photo accepted: the browser shrinks each to a few hundred KB, so this only stops a mistake. */
export const PHOTO_MAX_BYTES = MEDIA_LIMITS.photo.maxBytes;
/** Without Cloudinary a photo is kept in the database, so it must be small. */
export const PHOTO_DATABASE_MAX_BYTES = MEDIA_LIMITS.photo.databaseMaxBytes ?? 2 * 1024 * 1024;

export interface PhotoUpload {
  subject: PhotoSubject;
  data: Buffer;
  caption: string | null;
  takenAt: string | null;
  at: { longitude: number; latitude: number; accuracyM: number | null } | null;
}

/**
 * Photos of floods, drains, inspections and places saved by hand (docs/audit-and-permissions.md).
 *
 * - Adding one needs photos.add (on the route), and the person must be allowed to act where the thing is
 *   (region scope). A place takes photos only if it was saved by hand, for now: an imported facility
 *   belongs to OpenStreetMap.
 * - Seeing one needs photos.view: staff only as seeded. Photos never go on the public alert map, because
 *   they can show people and their homes.
 * - Deleting one is for whoever added it, or anyone with photos.delete_any. Each add and delete is in the
 *   activity log.
 * - Files are kept like a report's: an authenticated Cloudinary asset reached only through a signed link,
 *   or, with no Cloudinary account, in the database at no more than 2 MB.
 */
export class PhotoService {
  private static _instance?: PhotoService;
  static get Instance(): PhotoService {
    return (this._instance ??= new PhotoService(PhotoRepository.Instance, CloudinaryMediaStorage.Instance, RegionAccess.Instance, PermissionResolver.Instance, AuditService.Instance));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly photos: IPhotoRepository,
    private readonly storage: IMediaStorage,
    private readonly regions: Pick<RegionAccess, "assert">,
    private readonly permissions: Pick<PermissionResolver, "has">,
    private readonly audit: Pick<AuditService, "record">,
  ) {}

  /** What the screen should say about uploading: the size limit, and how many a subject may have. */
  limits() {
    return { maxPerSubject: MAX_PHOTOS_PER_SUBJECT, maxBytes: this.storage.enabled ? PHOTO_MAX_BYTES : PHOTO_DATABASE_MAX_BYTES, cloud: this.storage.enabled };
  }

  async add(upload: PhotoUpload, actor: AuthUser): Promise<PhotoDto> {
    const info = await this.photos.subjectInfo(upload.subject);
    if (!info) throw new NotFoundError(subjectWord(upload.subject.type));
    if (upload.subject.type === "place" && info.origin !== "manual") {
      throw new ForbiddenError("Photos can only be added to places saved by hand: an imported facility belongs to OpenStreetMap");
    }
    const area = info.wardId ?? info.lgaId;
    if (area) await this.regions.assert(actor, area);
    else if (actor.scopeAdminUnitId) throw new ForbiddenError();
    if (info.photoCount >= MAX_PHOTOS_PER_SUBJECT) throw new ConflictError(`It already has ${MAX_PHOTOS_PER_SUBJECT} photos: delete one to add another`);

    const mimeType = sniffMedia("photo", upload.data);
    if (!mimeType) throw new ValidationError([{ field: "file", message: "That isn't a JPEG, PNG or WebP photo" }]);
    const maxBytes = this.limits().maxBytes;
    if (upload.data.length > maxBytes) throw new AppError(413, `A photo must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller`);

    const file = await this.store(upload.data);
    try {
      const photo = await this.photos.insert({
        subject: upload.subject,
        file,
        mimeType,
        byteSize: upload.data.length,
        caption: upload.caption,
        takenAt: upload.takenAt,
        point: upload.at ? [upload.at.longitude, upload.at.latitude] : null,
        accuracyM: upload.at?.accuracyM ?? null,
        uploadedBy: actor.id,
        uploaderName: actor.displayName ?? actor.email,
      });
      await this.audit.record(actor, {
        action: "photo.added",
        entityType: "photo",
        entityId: photo.id,
        lgaId: info.lgaId,
        wardId: info.wardId,
        summary: `Added a photo to ${info.title}${upload.caption ? `: "${upload.caption}"` : ""}`,
        details: { subjectType: upload.subject.type, subjectId: upload.subject.id, distanceM: photo.distanceM, byteSize: photo.byteSize },
      });
      return photo;
    } catch (err) {
      // The row couldn't be stored: the file must not be left behind with nothing pointing at it.
      if (file.storage === "cloudinary") await this.storage.remove(file).catch((e: unknown) => logger.warn({ err: e, publicId: file.publicId }, "Couldn't remove an unused photo"));
      throw err;
    }
  }

  async list(subject: PhotoSubject): Promise<PhotoDto[]> {
    if (!(await this.photos.subjectInfo(subject))) throw new NotFoundError(subjectWord(subject.type));
    return this.photos.listFor(subject);
  }

  /** The photo's file: a signed Cloudinary link to send the browser to, or the bytes themselves. */
  async file(id: string): Promise<{ redirect: string } | { mimeType: string; data: Buffer }> {
    const photo = await this.photos.findById(id);
    if (!photo) throw new NotFoundError("Photo");
    if (photo.file.storage === "database") return { mimeType: photo.mimeType, data: photo.file.data };
    return { redirect: this.storage.deliveryUrl(photo.file) };
  }

  async remove(id: string, actor: AuthUser): Promise<void> {
    const photo = await this.photos.findById(id);
    if (!photo) throw new NotFoundError("Photo");
    if (photo.uploadedBy !== actor.id && !(await this.permissions.has(actor, "photos.delete_any"))) {
      throw new ForbiddenError("Only the person who added this photo, or someone allowed to delete anyone's photos, can delete it");
    }
    if (!(await this.photos.delete(id))) throw new NotFoundError("Photo");
    if (photo.file.storage === "cloudinary") {
      const file = photo.file;
      await this.storage.remove(file).catch((err: unknown) => logger.warn({ err, publicId: file.publicId }, "Couldn't remove a deleted photo's file"));
    }
    await this.audit.record(actor, {
      action: "photo.deleted",
      entityType: "photo",
      entityId: id,
      lgaId: photo.lgaId,
      wardId: photo.wardId,
      summary: `Deleted a photo${photo.uploaderName && photo.uploadedBy !== actor.id ? ` added by ${photo.uploaderName}` : ""} from a ${subjectWord(photo.subjectType).toLowerCase()}`,
      details: { subjectType: photo.subjectType, subjectId: photo.subjectId, uploadedBy: photo.uploadedBy },
    });
  }

  /**
   * Removes the files of every photo on something about to be deleted (a flood, a drain and its
   * inspections, a place). Their rows go with it in the database. A file that can't be removed is logged,
   * never a reason to keep the record.
   */
  async removeAllFor(subject: { floodExtentId?: string; drainId?: string; facilityId?: string }): Promise<void> {
    const files = await this.photos.cloudFilesFor(subject);
    await Promise.all(files.map((file) => this.storage.remove(file).catch((err: unknown) => logger.warn({ err, publicId: file.publicId }, "Couldn't remove a photo's file"))));
  }

  private async store(data: Buffer): Promise<StoredPhotoFile> {
    if (!this.storage.enabled) return { storage: "database", data };
    const folder = `map-photos/${new Date().toISOString().slice(0, 7)}`;
    const stored = await this.storage.upload({ data, resourceType: "image", folder });
    return { storage: "cloudinary", publicId: stored.publicId, resourceType: stored.resourceType, format: stored.format, version: stored.version };
  }
}

function subjectWord(type: PhotoSubject["type"]): string {
  return { flood: "Flood", drain: "Drain", inspection: "Inspection", place: "Place" }[type];
}
