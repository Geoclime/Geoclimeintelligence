import type { BBox, LonLat } from "../../common/geo/geo";
import type { FloodAlertDto } from "../alerts/alert.types";
import type { PublicFloodPoint } from "../field-survey/field-survey.types";
import type { PublicReportPoint } from "../flood-reports/flood-report.types";
import type { AdminUnitFeatureCollection, AdminUnitRef } from "../admin-units/admin-unit.types";
import type { MapLayerId } from "../map-layers/layer-rules";
import type { RainfallSeriesDto } from "../rainfall/rainfall.types";

// Replies of /api/v1/public: what the landing page shows before anyone signs in. Every field is
// shared reference data (areas, map layers, rainfall) or public safety information (alerts in
// force, and flood reports a reviewer has published, without the reporter). Nothing about users,
// imports or region scopes is ever part of a public reply.

/** How many areas there are at one level, e.g. 23 LGAs. */
export interface AreaLevelCount {
  level: number;
  levelName: string;
  count: number;
}

/** How much rainfall is loaded: the span of months with a value, and how many areas have it. */
export interface RainfallCoverage {
  /** "YYYY-MM". */
  firstMonth: string;
  /** "YYYY-MM": the latest month with a value. */
  lastMonth: string;
  areaCount: number;
}

/** A source credited on the landing page: enough to name and link it, nothing internal. */
export interface PublicSourceDto {
  id: string;
  provider: string;
  datasetName: string;
  url: string;
  license: string;
}

/** GET /api/v1/public/overview: the counters and credits on the landing page. */
export interface PublicOverviewDto {
  /** The top-level areas loaded so far, by name (e.g. Rivers State): what the platform covers today. */
  states: { id: string; countryCode: string; unitName: string; levelName: string }[];
  areas: AreaLevelCount[];
  layers: { id: MapLayerId; label: string; featureCount: number }[];
  rainfall: RainfallCoverage | null;
  /** Every source behind the areas, layers and rainfall above, once each. */
  sources: PublicSourceDto[];
  /** When these numbers were read (they are cached for a few minutes). */
  generatedAt: string;
}

/** An area that matched a search, named with its parent so two "Rumuola" wards can be told apart. */
export interface PublicAreaHit extends AdminUnitRef {
  parentName: string | null;
}

/** A named community (an OpenStreetMap settlement) that matched a search. */
export interface PublicCommunityHit {
  id: string;
  name: string;
  isPrimary: boolean;
  point: LonLat;
}

/** GET /api/v1/public/search?q=: areas and communities whose names contain `q`. */
export interface PublicSearchDto {
  areas: PublicAreaHit[];
  communities: PublicCommunityHit[];
}

/**
 * GET /api/v1/public/areas/:id: one area, the areas above it, and its rainfall. A ward has no
 * rainfall of its own, so `rainfall` may describe the nearest area above it that does
 * (`rainfall.adminUnit` says which); it is null when none has any.
 */
export interface PublicAreaDto {
  area: AdminUnitRef & { parentId: string | null; childCount: number; bbox: BBox; centroid: LonLat };
  /** The areas containing it, nearest first (a ward's LGA, then the state). */
  parents: AdminUnitRef[];
  rainfall: RainfallSeriesDto | null;
}

/**
 * GET /api/v1/public/outline: the LGAs (level 2), simplified, for the landing page's drawing of
 * the state. `bbox` is null, and `areas` empty, before any state is loaded.
 */
export interface PublicOutlineDto {
  bbox: BBox | null;
  areas: AdminUnitFeatureCollection;
}

/** One level's count and the sources behind it, as the database summarises it. */
export interface AreaLevelSummary extends AreaLevelCount {
  sourceIds: string[];
}

export interface RainfallCoverageSummary extends RainfallCoverage {
  sourceIds: string[];
}

/** The narrow reads the public service needs, so it can be unit-tested with in-memory fakes (section 2). */
export interface IAreaStatistics {
  summariseLevels(): Promise<AreaLevelSummary[]>;
}

export interface IRainfallCoverage {
  /** Null when no month has a value yet. */
  findCoverage(): Promise<RainfallCoverageSummary | null>;
}

export interface ICommunitySearch {
  /** Settlements whose name contains `q` (case-insensitive); names starting with it first, then primary settlements. */
  searchByName(q: string, limit: number): Promise<PublicCommunityHit[]>;
}

/** GET /api/v1/public/alert-map: the alerts in force now, recently published flood reports, and floods recorded on the ground. */
export interface PublicAlertMapDto {
  alerts: FloodAlertDto[];
  reports: PublicReportPoint[];
  /** How many days of published reports are included. */
  reportDays: number;
  /** Floods a responder recorded on the ground and has not marked receded, rounded to about 100 m. */
  floods: PublicFloodPoint[];
  /** How many days of recorded floods are included. */
  floodDays: number;
  generatedAt: string;
}
