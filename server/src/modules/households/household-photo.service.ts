import type { AuthUser } from "../../common/access/auth-user";
import { PermissionResolver } from "../../common/access/permission-resolver";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../common/errors/app-error";
import { CloudinaryMediaStorage, type IMediaStorage } from "../../common/storage/media-storage";
import { logger } from "../../config/logger";
import { AuditService } from "../audit/audit.service";
import { sniffMedia } from "../flood-reports/media-check";
import { PHOTO_DATABASE_MAX_BYTES, PHOTO_MAX_BYTES } from "../photos/photo.service";
import { HouseholdPhotoRepository } from "./household-photo.repository";
import type { HouseholdPhotoDto, IHouseholdPhotoRepository, StoredHouseholdFile } from "./household-photo.types";
import { HouseholdRepository } from "./household.repository";
import type { IHouseholdRepository } from "./household.types";

/** Photos one home may hold. */
export const MAX_HOUSEHOLD_PHOTOS = 3;

/**
 * Photos of a home, as private as the household: its owner and staff with households.view see them, and
 * nobody else, who is told only that the household doesn't exist. Only the owner adds one (an
 * administrator may remove one, to deal with abuse). Photos never go on a public map. Files are kept like
 * the map's photos: a signed Cloudinary link, or in the database at no more than 2 MB without Cloudinary.
 * The activity log records that a photo was added or removed, never where the home is.
 */
export class HouseholdPhotoService {
  private static _instance?: HouseholdPhotoService;
  static get Instance(): HouseholdPhotoService {
    return (this._instance ??= new HouseholdPhotoService(
      HouseholdPhotoRepository.Instance,
      HouseholdRepository.Instance,
      CloudinaryMediaStorage.Instance,
      PermissionResolver.Instance,
      AuditService.Instance,
    ));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly photos: IHouseholdPhotoRepository,
    private readonly households: Pick<IHouseholdRepository, "findById">,
    private readonly storage: IMediaStorage,
    private readonly permissions: Pick<PermissionResolver, "has">,
    private readonly audit: Pick<AuditService, "record">,
  ) {}

  limits() {
    return { maxPerHousehold: MAX_HOUSEHOLD_PHOTOS, maxBytes: this.storage.enabled ? PHOTO_MAX_BYTES : PHOTO_DATABASE_MAX_BYTES };
  }

  async list(householdId: string, actor: AuthUser): Promise<HouseholdPhotoDto[]> {
    await this.visible(householdId, actor);
    return this.photos.list(householdId);
  }

  async add(householdId: string, data: Buffer, actor: AuthUser): Promise<HouseholdPhotoDto> {
    const household = await this.visible(householdId, actor);
    if (household.ownerId !== actor.id) throw new ForbiddenError("Only the person who added a household can add photos to it");
    if ((await this.photos.count(householdId)) >= MAX_HOUSEHOLD_PHOTOS) {
      throw new ConflictError(`It already has ${MAX_HOUSEHOLD_PHOTOS} photos: delete one to add another`);
    }
    const mimeType = sniffMedia("photo", data);
    if (!mimeType) throw new ValidationError([{ field: "file", message: "That isn't a JPEG, PNG or WebP photo" }]);
    const maxBytes = this.limits().maxBytes;
    if (data.length > maxBytes) throw new AppError(413, `A photo must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller`);

    const file = await this.store(data);
    try {
      const photo = await this.photos.insert(householdId, file, mimeType, data.length);
      await this.audit.record(actor, {
        action: "household.photo_added",
        entityType: "household",
        entityId: householdId,
        lgaId: household.lgaId,
        wardId: household.wardId,
        summary: "Added a photo to their household",
      });
      return photo;
    } catch (err) {
      // The row couldn't be stored: the file must not be left behind with nothing pointing at it.
      if (file.storage === "cloudinary") await this.storage.remove(file).catch((e: unknown) => logger.warn({ err: e, publicId: file.publicId }, "Couldn't remove an unused household photo"));
      throw err;
    }
  }

  /** The photo's file: a signed Cloudinary link to send the browser to, or the bytes themselves. */
  async file(householdId: string, photoId: string, actor: AuthUser): Promise<{ redirect: string } | { mimeType: string; data: Buffer }> {
    await this.visible(householdId, actor);
    const photo = await this.photos.findById(photoId);
    if (!photo || photo.householdId !== householdId) throw new NotFoundError("Photo");
    if (photo.file.storage === "database") return { mimeType: photo.mimeType, data: photo.file.data };
    return { redirect: this.storage.deliveryUrl(photo.file) };
  }

  async remove(householdId: string, photoId: string, actor: AuthUser): Promise<void> {
    const household = await this.visible(householdId, actor);
    if (household.ownerId !== actor.id && actor.role !== "administrator") throw new ForbiddenError("Only the person who added a household can remove its photos");
    const photo = await this.photos.findById(photoId);
    if (!photo || photo.householdId !== householdId) throw new NotFoundError("Photo");
    if (!(await this.photos.delete(photoId))) throw new NotFoundError("Photo");
    if (photo.file.storage === "cloudinary") {
      const file = photo.file;
      await this.storage.remove(file).catch((err: unknown) => logger.warn({ err, publicId: file.publicId }, "Couldn't remove a deleted household photo's file"));
    }
    await this.audit.record(actor, {
      action: "household.photo_deleted",
      entityType: "household",
      entityId: householdId,
      lgaId: household.lgaId,
      wardId: household.wardId,
      summary: household.ownerId === actor.id ? "Removed a photo from their household" : "Removed a photo from someone's household",
    });
  }

  /**
   * Removes the files of every photo of a household about to be deleted. Their rows go with it in the
   * database. A file that can't be removed is logged, never a reason to keep the household.
   */
  async removeAllFor(householdId: string): Promise<void> {
    const files = await this.photos.cloudFilesOf(householdId);
    await Promise.all(files.map((file) => this.storage.remove(file).catch((err: unknown) => logger.warn({ err, publicId: file.publicId }, "Couldn't remove a household photo's file"))));
  }

  /** The household, if this person may see it; anyone else gets a 404, so nobody can probe for one. */
  private async visible(householdId: string, actor: AuthUser) {
    const household = await this.households.findById(householdId);
    if (!household) throw new NotFoundError("Household");
    if (household.ownerId === actor.id || (await this.permissions.has(actor, "households.view"))) return household;
    throw new NotFoundError("Household");
  }

  private async store(data: Buffer): Promise<StoredHouseholdFile> {
    if (!this.storage.enabled) return { storage: "database", data };
    const folder = `household-photos/${new Date().toISOString().slice(0, 7)}`;
    const stored = await this.storage.upload({ data, resourceType: "image", folder });
    return { storage: "cloudinary", publicId: stored.publicId, resourceType: stored.resourceType, format: stored.format, version: stored.version };
  }
}
