import type { RegionScoped } from "../../common/access/region-access";
import type { UserRole } from "../../common/access/roles";
import type { LonLat } from "../../common/geo/geo";
import type { PageMeta } from "../../common/response/api-response";
import type { StoredMedia, StoredResourceType } from "../../common/storage/media-storage";

/** How deep the water is, as a person can judge it. Mirrored by the flood_reports CHECK constraint. */
export const WATER_DEPTHS = ["ankle", "knee", "waist", "chest", "impassable"] as const;
export type WaterDepth = (typeof WATER_DEPTHS)[number];

export const REPORT_STATUSES = ["pending", "published", "rejected"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** Who reviews reports (administrators always may), inside their region scope. */
export const REVIEWER_ROLES: readonly UserRole[] = ["emergency_responder", "government_official", "administrator"];

/** Photos, voice notes, short videos and documents (PDF). Videos and documents need Cloudinary. */
export const MEDIA_KINDS = ["photo", "audio", "video", "file"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** A file as reports carry it: what it is, and a signed link when it is in Cloudinary. */
export interface FloodReportMediaRef {
  id: string;
  kind: MediaKind;
  mimeType: string;
  byteSize: number;
  /** A signed Cloudinary link, only in replies to someone allowed to see the report. Null: fetch it through the API. */
  url: string | null;
}

/** A media row as the repository reads it, with where its file is. */
export interface FloodReportMediaRow extends Omit<FloodReportMediaRef, "url"> {
  storage: "database" | "cloudinary";
  publicId: string | null;
  resourceType: StoredResourceType | null;
  format: string | null;
  version: number | null;
}

/** A report as the repository reads it. */
export interface FloodReportRow {
  id: string;
  reporterId: string | null;
  reporterName: string | null;
  reporterOrganisation: string | null;
  point: LonLat;
  locationName: string;
  lgaId: string | null;
  lgaName: string | null;
  wardId: string | null;
  wardName: string | null;
  waterDepth: WaterDepth;
  description: string;
  status: ReportStatus;
  reviewNote: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  media: FloodReportMediaRow[];
}

export interface FloodReportDto {
  id: string;
  point: LonLat;
  locationName: string;
  lga: { id: string; unitName: string } | null;
  ward: { id: string; unitName: string } | null;
  waterDepth: WaterDepth;
  description: string;
  status: ReportStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  createdAt: string;
  media: FloodReportMediaRef[];
  /** Who sent it: shown to reviewers only, never to other members of the public. */
  reporter: { name: string | null; organisation: string | null } | null;
  /** True when the signed-in user sent it. */
  mine: boolean;
}

/** A file ready to be recorded: either its bytes (database storage) or where Cloudinary put it. */
export type NewMedia =
  | { storage: "database"; kind: MediaKind; mimeType: string; data: Buffer }
  | { storage: "cloudinary"; kind: MediaKind; mimeType: string; stored: StoredMedia };

export interface NewFloodReport {
  reporterId: string;
  point: LonLat;
  locationName: string;
  lgaId: string | null;
  wardId: string | null;
  waterDepth: WaterDepth;
  description: string;
  media: NewMedia[];
}

export type FloodReportFilter = RegionScoped<{
  status?: ReportStatus;
  reporterId?: string;
  page: number;
  pageSize: number;
}>;

export interface ReviewDecision {
  status: Exclude<ReportStatus, "pending">;
  note: string | null;
  reviewerId: string;
  at: Date;
}

/** A published report on the public alert map: no person, no text, and the point rounded to about 100 m. */
export interface PublicReportPoint {
  id: string;
  point: LonLat;
  waterDepth: WaterDepth;
  lgaName: string | null;
  createdAt: string;
}

/** What services depend on, so they can be unit-tested with an in-memory fake (section 2). */
export interface IFloodReportRepository {
  create(input: NewFloodReport): Promise<string>;
  findReport(id: string): Promise<FloodReportRow | null>;
  findReportPage(filter: FloodReportFilter): Promise<{ items: FloodReportRow[]; meta: PageMeta }>;
  /** Records a review; false unless the report was still pending. */
  review(id: string, decision: ReviewDecision): Promise<boolean>;
  findMedia(reportId: string, mediaId: string): Promise<FloodReportMediaRow & { data: Buffer | null } | null>;
  countSince(reporterId: string, since: Date): Promise<number>;
  findPublishedSince(since: Date, limit: number): Promise<PublicReportPoint[]>;
}

export function toReportDto(row: FloodReportRow, viewer: { id: string; canReview: boolean }, deliveryUrl: (media: FloodReportMediaRow) => string | null): FloodReportDto {
  return {
    id: row.id,
    point: row.point,
    locationName: row.locationName,
    lga: row.lgaId && row.lgaName ? { id: row.lgaId, unitName: row.lgaName } : null,
    ward: row.wardId && row.wardName ? { id: row.wardId, unitName: row.wardName } : null,
    waterDepth: row.waterDepth,
    description: row.description,
    status: row.status,
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    media: row.media.map((m) => ({ id: m.id, kind: m.kind, mimeType: m.mimeType, byteSize: m.byteSize, url: deliveryUrl(m) })),
    reporter: viewer.canReview ? { name: row.reporterName, organisation: row.reporterOrganisation } : null,
    mine: row.reporterId === viewer.id,
  };
}
