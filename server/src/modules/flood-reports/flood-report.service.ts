import type { AuthUser } from "../../common/access/auth-user";
import { RegionAccess } from "../../common/access/region-access";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../common/errors/app-error";
import type { PageMeta } from "../../common/response/api-response";
import { CloudinaryMediaStorage, type IMediaStorage } from "../../common/storage/media-storage";
import { logger } from "../../config/logger";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import type { IAdminUnitRepository } from "../admin-units/admin-unit.types";
import { FloodReportRepository } from "./flood-report.repository";
import {
  REVIEWER_ROLES,
  toReportDto,
  type FloodReportDto,
  type FloodReportMediaRow,
  type FloodReportRow,
  type IFloodReportRepository,
  type MediaKind,
  type NewMedia,
} from "./flood-report.types";
import type { CreateReportBody, ListReportsQuery, MyReportsQuery, ReviewReportBody } from "./flood-report.validation";
import { CLOUDINARY_RESOURCE_TYPE, MEDIA_LIMITS, sniffMedia } from "./media-check";

/** Reports one account may send per hour: plenty for a real flood, a brake on a flood of spam. */
export const REPORTS_PER_HOUR = 10;

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

/** The uploads of one report, by form field. */
export interface ReportFiles {
  photos?: UploadedFile[];
  audio?: UploadedFile[];
  video?: UploadedFile[];
  files?: UploadedFile[];
}

/** What the report form may offer: videos and documents only when Cloudinary is set up. */
export interface ReportMediaOptions {
  cloudStorage: boolean;
  limits: Record<MediaKind, { maxCount: number; maxBytes: number; maxSeconds: number | null; enabled: boolean }>;
}

/** A file that passed its checks, not yet stored. */
interface CheckedFile {
  kind: MediaKind;
  mimeType: string;
  data: Buffer;
  name: string;
}

/**
 * Community flood reports. Any signed-in user may send one; it stays private (to the reporter and
 * the reviewers) until a responder, official or administrator publishes it. Reviewers only see
 * and act on reports inside their region scope (section 7).
 */
export class FloodReportService {
  private static _instance?: FloodReportService;
  static get Instance(): FloodReportService {
    return (this._instance ??= new FloodReportService(
      FloodReportRepository.Instance,
      AdminUnitRepository.Instance,
      RegionAccess.Instance,
      CloudinaryMediaStorage.Instance,
    ));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly reports: IFloodReportRepository,
    private readonly units: Pick<IAdminUnitRepository, "findContaining" | "findSummaryById">,
    private readonly regions: Pick<RegionAccess, "assert" | "scope">,
    private readonly storage: IMediaStorage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  options(): ReportMediaOptions {
    const cloud = this.storage.enabled;
    const limits = Object.fromEntries(
      (Object.keys(MEDIA_LIMITS) as MediaKind[]).map((kind) => {
        const limit = MEDIA_LIMITS[kind];
        const enabled = cloud || limit.databaseMaxBytes !== null;
        const maxBytes = cloud ? limit.maxBytes : (limit.databaseMaxBytes ?? 0);
        return [kind, { maxCount: limit.maxCount, maxBytes, maxSeconds: limit.maxSeconds ?? null, enabled }];
      }),
    ) as ReportMediaOptions["limits"];
    return { cloudStorage: cloud, limits };
  }

  async submit(user: AuthUser, body: CreateReportBody, files: ReportFiles): Promise<FloodReportDto> {
    const recent = await this.reports.countSince(user.id, new Date(this.now().getTime() - 3_600_000));
    if (recent >= REPORTS_PER_HOUR) throw new AppError(429, `You can send up to ${REPORTS_PER_HOUR} reports an hour. Please try again later.`);

    const checked = [
      ...this.checkFiles("photo", files.photos ?? []),
      ...this.checkFiles("audio", files.audio ?? []),
      ...this.checkFiles("video", files.video ?? []),
      ...this.checkFiles("file", files.files ?? []),
    ];

    // The LGA and ward containing the point. A ward filed under a different LGA than the one
    // containing the point (the two boundary sets don't always agree) is left out.
    const units = await this.units.findContaining(body.lon, body.lat);
    const lga = units.find((u) => u.level === 2) ?? null;
    let ward = units.find((u) => u.level === 3) ?? null;
    if (ward && lga && (await this.units.findSummaryById(ward.id))?.parentId !== lga.id) ward = null;

    // Files go to storage first; if recording the report then fails, they are removed again, so
    // no orphaned upload is left behind.
    const media = await this.store(checked);
    let id: string;
    try {
      id = await this.reports.create({
        reporterId: user.id,
        point: [body.lon, body.lat],
        locationName: body.locationName,
        lgaId: lga?.id ?? null,
        wardId: ward?.id ?? null,
        waterDepth: body.waterDepth,
        description: body.description,
        media,
      });
    } catch (error) {
      await this.discard(media);
      throw error;
    }
    return this.toDto((await this.reports.findReport(id))!, user);
  }

  async mine(user: AuthUser, query: MyReportsQuery): Promise<{ items: FloodReportDto[]; meta: PageMeta }> {
    const { items, meta } = await this.reports.findReportPage({ reporterId: user.id, page: query.page, pageSize: query.pageSize });
    return { items: items.map((row) => this.toDto(row, user)), meta };
  }

  /** The review list: reports inside the reviewer's region scope. */
  async list(user: AuthUser, query: ListReportsQuery): Promise<{ items: FloodReportDto[]; meta: PageMeta }> {
    const scoped = await this.regions.scope({ status: query.status, page: query.page, pageSize: query.pageSize }, user);
    const { items, meta } = await this.reports.findReportPage(scoped);
    return { items: items.map((row) => this.toDto(row, user)), meta };
  }

  async get(id: string, user: AuthUser): Promise<FloodReportDto> {
    return this.toDto(await this.visible(id, user), user);
  }

  async review(id: string, user: AuthUser, body: ReviewReportBody): Promise<FloodReportDto> {
    const row = await this.reports.findReport(id);
    if (!row) throw new NotFoundError("Report");
    await this.assertCanReview(row, user);
    if (row.status !== "pending") throw new ConflictError("This report has already been reviewed");
    const done = await this.reports.review(id, {
      status: body.decision === "publish" ? "published" : "rejected",
      note: body.note,
      reviewerId: user.id,
      at: this.now(),
    });
    if (!done) throw new ConflictError("This report has already been reviewed");
    return this.toDto((await this.reports.findReport(id))!, user);
  }

  /** A report's file: its bytes when kept in the database, or a signed link when it is in Cloudinary. */
  async media(id: string, mediaId: string, user: AuthUser): Promise<{ mimeType: string; data: Buffer } | { redirect: string }> {
    await this.visible(id, user);
    const file = await this.reports.findMedia(id, mediaId);
    if (!file) throw new NotFoundError("Media");
    if (file.storage === "database" && file.data) return { mimeType: file.mimeType, data: file.data };
    const url = this.deliveryUrl(file);
    if (!url) throw new NotFoundError("Media");
    return { redirect: url };
  }

  /** Published reports from the last `days` days, for the public alert map. */
  publishedSince(days: number, limit: number) {
    return this.reports.findPublishedSince(new Date(this.now().getTime() - days * 86_400_000), limit);
  }

  /** A report is visible to its reporter, to reviewers in scope, and, once published, to anyone signed in. */
  private async visible(id: string, user: AuthUser): Promise<FloodReportRow> {
    const row = await this.reports.findReport(id);
    if (!row) throw new NotFoundError("Report");
    if (row.reporterId === user.id || row.status === "published") return row;
    await this.assertCanReview(row, user);
    return row;
  }

  private async assertCanReview(row: FloodReportRow, user: AuthUser): Promise<void> {
    if (!REVIEWER_ROLES.includes(user.role)) throw new ForbiddenError("Your role is not permitted to review reports");
    if (!user.scopeAdminUnitId) return;
    // A scoped reviewer may act on reports in their region; one outside every mapped area is no one's region.
    const area = row.wardId ?? row.lgaId;
    if (!area) throw new ForbiddenError();
    await this.regions.assert(user, area);
  }

  private toDto(row: FloodReportRow, user: AuthUser): FloodReportDto {
    return toReportDto(row, { id: user.id, canReview: REVIEWER_ROLES.includes(user.role) }, (media) => this.deliveryUrl(media));
  }

  /** A signed link for a Cloudinary file; null for one kept in the database (fetched through the API). */
  private deliveryUrl(media: FloodReportMediaRow): string | null {
    if (media.storage !== "cloudinary" || !media.publicId || !media.resourceType || media.version === null) return null;
    return this.storage.deliveryUrl({ publicId: media.publicId, resourceType: media.resourceType, format: media.format, version: media.version });
  }

  /** Checks the count, size and real type (by content) of one kind of upload. */
  private checkFiles(kind: MediaKind, files: UploadedFile[]): CheckedFile[] {
    if (files.length === 0) return [];
    const limit = MEDIA_LIMITS[kind];
    const maxBytes = this.storage.enabled ? limit.maxBytes : limit.databaseMaxBytes;
    if (maxBytes === null) {
      throw new ValidationError([{ field: limit.field, message: `Attaching a ${kind === "video" ? "video" : "document"} needs media storage, which isn't set up yet` }]);
    }
    if (files.length > limit.maxCount) throw new ValidationError([{ field: limit.field, message: `Attach at most ${limit.maxCount} of this kind` }]);
    return files.map((file) => {
      if (file.buffer.length > maxBytes) {
        throw new ValidationError([{ field: limit.field, message: `${file.originalname} is larger than ${maxBytes / (1024 * 1024)} MB` }]);
      }
      const mimeType = sniffMedia(kind, file.buffer);
      if (!mimeType) throw new ValidationError([{ field: limit.field, message: `${file.originalname} isn't a supported ${limit.label}` }]);
      return { kind, mimeType, data: file.buffer, name: file.originalname };
    });
  }

  /** Uploads to Cloudinary when it is set up (all or nothing), else keeps the bytes for the database. */
  private async store(files: CheckedFile[]): Promise<NewMedia[]> {
    if (!this.storage.enabled) return files.map(({ kind, mimeType, data }) => ({ storage: "database", kind, mimeType, data }));
    const stored: NewMedia[] = [];
    const folder = `flood-reports/${this.now().toISOString().slice(0, 7)}`;
    try {
      for (const file of files) {
        const result = await this.storage.upload({ data: file.data, resourceType: CLOUDINARY_RESOURCE_TYPE[file.kind], folder });
        stored.push({ storage: "cloudinary", kind: file.kind, mimeType: file.mimeType, stored: result });
        const maxSeconds = MEDIA_LIMITS[file.kind].maxSeconds;
        if (maxSeconds && result.duration !== null && result.duration > maxSeconds + 1) {
          throw new ValidationError([{ field: MEDIA_LIMITS[file.kind].field, message: `${file.name} is longer than ${maxSeconds} seconds` }]);
        }
      }
      return stored;
    } catch (error) {
      await this.discard(stored);
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, "Uploading report media to Cloudinary failed");
      throw new AppError(502, "Your photos or recordings couldn't be stored just now. Please try again.");
    }
  }

  /** Removes uploads that won't be recorded. Best effort: a failure is logged, never thrown. */
  private async discard(media: NewMedia[]): Promise<void> {
    await Promise.all(
      media.map((item) =>
        item.storage === "cloudinary"
          ? this.storage.remove(item.stored).catch((err: unknown) => logger.warn({ err, publicId: item.stored.publicId }, "Couldn't remove an unused upload"))
          : Promise.resolve(),
      ),
    );
  }
}

