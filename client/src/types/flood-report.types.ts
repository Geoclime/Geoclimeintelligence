import type { LonLat } from "./admin-unit.types";

// Mirrors server/src/modules/flood-reports/flood-report.types.ts.

export const WATER_DEPTHS = ["ankle", "knee", "waist", "chest", "impassable"] as const;
export type WaterDepth = (typeof WATER_DEPTHS)[number];

export type ReportStatus = "pending" | "published" | "rejected";

export type MediaKind = "photo" | "audio" | "video" | "file";

export interface FloodReportMediaRef {
  id: string;
  kind: MediaKind;
  mimeType: string;
  byteSize: number;
  /** A signed Cloudinary link; null when the file is kept in the database (fetch it through the API). */
  url: string | null;
}

/** GET /api/v1/flood-reports/options: which media the form may offer, and their limits. */
export interface ReportMediaOptions {
  cloudStorage: boolean;
  limits: Record<MediaKind, { maxCount: number; maxBytes: number; maxSeconds: number | null; enabled: boolean }>;
}

export interface FloodReport {
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
  /** Shown to reviewers only. */
  reporter: { name: string | null; organisation: string | null } | null;
  mine: boolean;
}

/** What the report form sends (as multipart form data). */
export interface NewFloodReport {
  point: LonLat;
  locationName: string;
  waterDepth: WaterDepth;
  description: string;
  photos: Blob[];
  audio: Blob | null;
  video: File | null;
  files: File[];
}

/** A published report on the public alert map: rounded point, no person, no text. */
export interface PublicReportPoint {
  id: string;
  point: LonLat;
  waterDepth: WaterDepth;
  lgaName: string | null;
  createdAt: string;
}

export interface ReportListParams {
  status?: ReportStatus;
  page: number;
  pageSize: number;
}
