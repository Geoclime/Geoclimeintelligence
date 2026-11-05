import type { LineString, MultiLineString, MultiPolygon, Point } from "geojson";
import type { LonLat } from "./admin-unit.types";
import type { WaterDepth } from "./flood-report.types";
import type { FacilityType, LayerFeatureCollection } from "./map-layer.types";

// Mirror server/src/modules/field-survey/survey-rules.ts and field-survey.types.ts.

/** How a shape was captured: GPS fixes while walking, or points tapped on the map. */
export type SurveyMethod = "walked" | "drawn";
/** How a drain came to be on the map: by hand, or from a drainage plan file. */
export type RecordMethod = SurveyMethod | "import";

/** Which way water runs along a drain's line: from its first point to its last, or the other way. */
export const FLOW_DIRECTIONS = ["with_line", "against_line"] as const;
export type FlowDirection = (typeof FLOW_DIRECTIONS)[number];

export const DRAIN_MATERIALS = ["concrete", "masonry", "plastic", "metal", "earth", "other"] as const;
export type DrainMaterial = (typeof DRAIN_MATERIALS)[number];

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
  /** Households people marked inside the flood: a count only. Absent from an older backend. */
  households?: number;
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
  method: RecordMethod;
  flowDirection: FlowDirection | null;
  diameterM: number | null;
  material: DrainMaterial | null;
  barrels: number | null;
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
  /** Photos on it (seen only by staff with photos.view). Absent from an older backend. */
  photoCount?: number;
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
  /** Absent from an older backend (and on a drain just drawn before the layer is fetched again). */
  method?: RecordMethod;
  flowDirection?: FlowDirection | null;
  diameterM?: number | null;
  material?: DrainMaterial | null;
  barrels?: number | null;
  photoCount?: number;
  /** The LGA and ward it is filed under, so a place's page can draw only its own drains. */
  lgaId: string | null;
  wardId: string | null;
}

/** One drain in a place's list. Mirrors DrainageSummaryItem in server/src/modules/field-survey/field-survey.types.ts. */
export interface DrainageSummaryItem {
  id: string;
  kind: DrainageKind;
  condition: DrainageCondition;
  name: string | null;
  widthM: number | null;
  depthM: number | null;
  lengthM: number | null;
  lastCheckedAt: string;
  wardName: string | null;
  longitude: number;
  latitude: number;
}

/** GET /api/v1/drainage/summary?areaId=: the drainage recorded in an LGA or ward, totals over all of it and the first drains, the worst first. */
export interface DrainageSummary {
  total: number;
  /** Blocked, overflowing or damaged. */
  needAttention: number;
  partlyBlocked: number;
  clear: number;
  lastCheckedAt: string | null;
  items: DrainageSummaryItem[];
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
  flowDirection?: FlowDirection;
  diameterM?: number;
  material?: DrainMaterial;
  barrels?: number;
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
  flowDirection?: FlowDirection | null;
  diameterM?: number | null;
  material?: DrainMaterial | null;
  barrels?: number | null;
  /** What the inspector wants kept about this check (the drain's own note is `note`). */
  inspectionNote?: string;
  /** Where they stood, if the phone shared it: the log says how far from the drain the check was made. */
  at?: { longitude: number; latitude: number; accuracyM?: number };
}

/** PATCH /drainage/:id replies with the drain and the id of the inspection just logged (for its photos). */
export type InspectedDrainage = Drainage & { inspectionId: string };

/** One "I checked it", for staff (survey.view_people). Mirrors DrainInspectionDto on the server. */
export interface DrainInspection {
  id: string;
  inspectedAt: string;
  inspectedBy: string | null;
  inspectorName: string | null;
  inspectorRole: string;
  conditionBefore: DrainageCondition;
  conditionAfter: DrainageCondition;
  note: string | null;
  distanceM: number | null;
  accuracyM: number | null;
  photoCount: number;
}

/** A person on a record, as staff see them: a name and a role, never an email. */
export interface PersonRef {
  id: string | null;
  name: string | null;
  role: string | null;
}

export interface DrainPeople {
  recordedBy: PersonRef | null;
  lastCheckedBy: PersonRef | null;
  lastCheckedAt: string;
}

export interface FloodPeople {
  recordedBy: PersonRef | null;
  recededBy: PersonRef | null;
  recededAt: string | null;
  reopenedBy: PersonRef | null;
  reopenedAt: string | null;
}

/** What a flood reaches, as shapes to draw over it. */
export type FloodImpactFeatureCollection = LayerFeatureCollection<
  MultiPolygon | Point | MultiLineString,
  { kind: "building" | "road" | "facility"; name: string | null }
>;

/** POST /drainage/import: what happened to each feature of the plan. */
export interface DrainageImportReport {
  featuresInFile: number;
  inserted: number;
  alreadyPresent: number;
  rejected: Record<string, number>;
}

/**
 * A saved flood or drain the user clicked on the map: what its popup shows. A flood just saved comes
 * with its impact already worked out, so its popup doesn't ask for it again.
 */
export type SelectedSurvey =
  | { type: "flood"; properties: FloodExtentFeatureProperties; point: LonLat; impact?: FloodImpact }
  | { type: "drain"; properties: DrainageFeatureProperties; point: LonLat };
