import type { LineString, MultiPolygon, Point } from "geojson";
import type { LonLat } from "./admin-unit.types";
import type { WaterDepth } from "./flood-report.types";
import type { FacilityType, LayerFeatureCollection } from "./map-layer.types";

// Mirror server/src/modules/field-survey/survey-rules.ts and field-survey.types.ts.

/** How a shape was captured: GPS fixes while walking, or points tapped on the map. */
export type SurveyMethod = "walked" | "drawn";

export const DRAINAGE_KINDS = ["open_drain", "covered_drain", "culvert", "outfall", "inlet", "retention_pond"] as const;
export type DrainageKind = (typeof DRAINAGE_KINDS)[number];

/** Best to worst: what an inspection found. */
export const DRAINAGE_CONDITIONS = ["clear", "partly_blocked", "blocked", "overflowing", "damaged"] as const;
export type DrainageCondition = (typeof DRAINAGE_CONDITIONS)[number];

/** What is being recorded: a flood's edge, a drain walked as a line, or one spot (a culvert, outfall...). */
export type SurveyTarget = "flood" | "drain-line" | "drain-spot";

export interface FloodExtent {
  id: string;
  areaM2: number;
  perimeterM: number;
  depth: WaterDepth | null;
  note: string | null;
  method: SurveyMethod;
  pointCount: number;
  accuracyM: number | null;
  wardId: string | null;
  lgaId: string | null;
  receded: boolean;
  recededAt: string | null;
  observedAt: string;
  /** A point inside the shape, to open it on the map. */
  longitude: number;
  latitude: number;
}

export interface NearbyDrain {
  id: string;
  name: string | null;
  kind: DrainageKind;
  condition: DrainageCondition;
  distanceM: number;
}

/** What a flood reaches. */
export interface FloodImpact {
  areaM2: number;
  buildings: number;
  roadMetres: number;
  facilities: { total: number; items: { name: string | null; facilityType: FacilityType; osmClass: string }[] };
  settlements: string[];
  wards: string[];
  drains: { total: number; needAttention: number; items: NearbyDrain[] };
}

/** One flood in a place's history. Mirrors FloodHistoryItem in server/src/modules/field-survey/field-survey.types.ts. */
export interface FloodHistoryItem {
  id: string;
  areaM2: number;
  depth: WaterDepth | null;
  method: SurveyMethod;
  observedAt: string;
  receded: boolean;
  recededAt: string | null;
  /** The ward it was in. */
  wardName: string | null;
  longitude: number;
  latitude: number;
}

/** GET /api/v1/flood-extents/history?areaId=: the floods recorded in an LGA or ward, with totals over all of them. */
export interface FloodHistory {
  total: number;
  active: number;
  largestAreaM2: number;
  latestAt: string | null;
  items: FloodHistoryItem[];
}

export interface FloodExtentWithImpact {
  extent: FloodExtent;
  impact: FloodImpact;
}

export interface Drainage {
  id: string;
  kind: DrainageKind;
  condition: DrainageCondition;
  name: string | null;
  widthM: number | null;
  depthM: number | null;
  lengthM: number | null;
  note: string | null;
  method: SurveyMethod;
  wardId: string | null;
  lgaId: string | null;
  lastCheckedAt: string;
  longitude: number;
  latitude: number;
}

export interface FloodExtentFeatureProperties {
  id: string;
  areaM2: number;
  depth: WaterDepth | null;
  method: SurveyMethod;
  receded: boolean;
  observedAt: string;
  /** The LGA and ward it is filed under, so a place's page can draw only its own floods. */
  lgaId: string | null;
  wardId: string | null;
}

export interface DrainageFeatureProperties {
  id: string;
  kind: DrainageKind;
  condition: DrainageCondition;
  name: string | null;
  widthM: number | null;
  depthM: number | null;
  lengthM: number | null;
  note: string | null;
  lastCheckedAt: string;
}

export type FloodExtentFeatureCollection = LayerFeatureCollection<MultiPolygon, FloodExtentFeatureProperties>;
export type DrainageFeatureCollection = LayerFeatureCollection<Point | LineString, DrainageFeatureProperties>;

/** POST /api/v1/flood-extents. The ring is closed for you. */
export interface NewFloodExtentBody {
  points: LonLat[];
  method: SurveyMethod;
  depth?: WaterDepth;
  note?: string;
  accuracyM?: number;
}

/** POST /api/v1/drainage. A line kind needs two or more points, any other kind exactly one. */
export interface NewDrainageBody {
  kind: DrainageKind;
  condition: DrainageCondition;
  name?: string;
  widthM?: number;
  depthM?: number;
  note?: string;
  method: SurveyMethod;
  points: LonLat[];
}

/** PATCH /api/v1/drainage/:id: an inspection. A blank name or note clears it, null clears a size. */
export interface UpdateDrainageBody {
  condition?: DrainageCondition;
  name?: string;
  widthM?: number | null;
  depthM?: number | null;
  note?: string;
}

/**
 * A saved flood or drain the user clicked on the map: what its popup shows. A flood just saved comes
 * with its impact already worked out, so its popup doesn't ask for it again.
 */
export type SelectedSurvey =
  | { type: "flood"; properties: FloodExtentFeatureProperties; point: LonLat; impact?: FloodImpact }
  | { type: "drain"; properties: DrainageFeatureProperties; point: LonLat };
