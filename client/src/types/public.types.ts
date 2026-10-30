import type { AdminUnitFeatureCollection, AdminUnitRef, BBox, LonLat } from "./admin-unit.types";
import type { FloodAlert } from "./alert.types";
import type { PublicReportPoint } from "./flood-report.types";

/** GET /api/v1/public/alert-map: the alerts in force now and the reports published in the last `reportDays` days. */
export interface PublicAlertMap {
  alerts: FloodAlert[];
  reports: PublicReportPoint[];
  reportDays: number;
  generatedAt: string;
}
import type { RainfallSeries } from "./rainfall.types";

// Mirrors server/src/modules/public/public.types.ts: what the landing page reads before sign-in.

export interface AreaLevelCount {
  level: number;
  levelName: string;
  count: number;
}

export interface RainfallCoverage {
  /** "YYYY-MM". */
  firstMonth: string;
  /** "YYYY-MM": the latest month with a value. */
  lastMonth: string;
  areaCount: number;
}

export interface PublicSource {
  id: string;
  provider: string;
  datasetName: string;
  url: string;
  license: string;
}

export type PublicLayerId = "roads" | "waterways" | "settlements" | "infrastructure" | "buildings";

/** GET /api/v1/public/overview. */
export interface PublicOverview {
  /** The top-level areas loaded so far (e.g. Rivers State): what the platform covers today. */
  states: { id: string; countryCode: string; unitName: string; levelName: string }[];
  areas: AreaLevelCount[];
  layers: { id: PublicLayerId; label: string; featureCount: number }[];
  rainfall: RainfallCoverage | null;
  sources: PublicSource[];
  generatedAt: string;
}

/** GET /api/v1/public/outline: the LGAs, simplified. Empty before any state is loaded. */
export interface PublicOutline {
  bbox: BBox | null;
  areas: AdminUnitFeatureCollection;
}

export interface PublicAreaHit extends AdminUnitRef {
  parentName: string | null;
}

export interface PublicCommunityHit {
  id: string;
  name: string;
  isPrimary: boolean;
  point: LonLat;
}

/** GET /api/v1/public/search?q=. */
export interface PublicSearchResults {
  areas: PublicAreaHit[];
  communities: PublicCommunityHit[];
}

/**
 * GET /api/v1/public/areas/:id. A ward has no rainfall of its own, so `rainfall` may belong to
 * the area above it (`rainfall.adminUnit` says which); null when none has any.
 */
export interface PublicArea {
  area: AdminUnitRef & { parentId: string | null; childCount: number; bbox: BBox; centroid: LonLat };
  parents: AdminUnitRef[];
  rainfall: RainfallSeries | null;
}
