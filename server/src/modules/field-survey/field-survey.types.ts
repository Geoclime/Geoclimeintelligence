import type { LineString, MultiLineString, MultiPolygon, Point } from "geojson";
import type { LonLat } from "../../common/geo/geo";
import type { FacilityType } from "../map-layers/layer-rules";
import type { LayerFeatureCollection, LayerGeoJsonQuery } from "../map-layers/map-layer.types";
import type { DrainageCondition, DrainageKind, DrainMaterial, FloodDepth, FlowDirection, RecordMethod, SurveyMethod } from "./survey-rules";

// ---------- flood extents ----------

export interface FloodExtentDto {
  id: string;
  areaM2: number;
  perimeterM: number;
  depth: FloodDepth | null;
  note: string | null;
  method: SurveyMethod;
  pointCount: number;
  /** The typical GPS accuracy of a walk, in metres; null for a shape drawn on the map. */
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

export interface NewFloodExtent {
  countryCode: string;
  wardId: string | null;
  lgaId: string | null;
  points: LonLat[];
  method: SurveyMethod;
  depth: FloodDepth | null;
  note: string | null;
  accuracyM: number | null;
  recordedBy: string;
}

/** A stored extent as a service reads it before acting on it. */
export interface FloodExtentRecord {
  id: string;
  wardId: string | null;
  lgaId: string | null;
  recordedBy: string | null;
  recededAt: Date | null;
}

export interface FloodExtentFeatureProperties {
  id: string;
  areaM2: number;
  depth: FloodDepth | null;
  method: SurveyMethod;
  receded: boolean;
  observedAt: string;
  /** Photos on the flood (seen only with photos.view). */
  photoCount: number;
  /** The LGA and ward it is filed under (at its middle), so a place's page can draw only its own floods. */
  lgaId: string | null;
  wardId: string | null;
}

export type FloodExtentFeatureCollection = LayerFeatureCollection<MultiPolygon, FloodExtentFeatureProperties>;

export interface NearbyDrain {
  id: string;
  name: string | null;
  kind: DrainageKind;
  condition: DrainageCondition;
  distanceM: number;
}

/** What a flood reaches: the answer to "how bad is it, and what do we send?". */
export interface FloodImpact {
  areaM2: number;
  /** Building outlines the flood touches (zero until the buildings layer is loaded). */
  buildings: number;
  /** Households people marked as their homes inside the flood: a count only, never who or where. */
  households: number;
  /** Road length under water, in metres, summed over every road segment it crosses. */
  roadMetres: number;
  facilities: { total: number; items: { name: string | null; facilityType: FacilityType; osmClass: string }[] };
  settlements: string[];
  /** Wards the flood touches, so the right ward officers are told. */
  wards: string[];
  /** Drains within reach of the flood, those needing attention first: the likely cause, or the first fix. */
  drains: { total: number; needAttention: number; items: NearbyDrain[] };
}

/**
 * A flood on the public alert map: where it is (rounded to about 100 m, as a published report's is), how
 * big, how deep, and which LGA. Never its outline, its note or who recorded it.
 */
export interface PublicFloodPoint {
  id: string;
  point: LonLat;
  areaM2: number;
  depth: FloodDepth | null;
  lgaName: string | null;
  observedAt: string;
}

/** One flood in a place's history. No outline, note or recorder: the same as the map layer shows. */
export interface FloodHistoryItem {
  id: string;
  areaM2: number;
  depth: FloodDepth | null;
  method: SurveyMethod;
  observedAt: string;
  receded: boolean;
  recededAt: string | null;
  /** The ward it was in, so an LGA's list says where. */
  wardName: string | null;
  /** A point inside it, to open it on the map. */
  longitude: number;
  latitude: number;
}

/** Every flood recorded in an LGA or ward: the totals, and the latest ones. */
export interface FloodHistory {
  total: number;
  /** Not yet marked receded. */
  active: number;
  largestAreaM2: number;
  /** When the most recent was recorded; null when there are none. */
  latestAt: string | null;
  items: FloodHistoryItem[];
}

/** What a flood reaches, as shapes to draw over it: `kind` says which. Capped, so `truncated` says when more were inside. */
export type FloodImpactFeatureCollection = LayerFeatureCollection<
  MultiPolygon | Point | MultiLineString,
  { kind: "building" | "road" | "facility"; name: string | null }
>;

export interface FloodExtentWithImpact {
  extent: FloodExtentDto;
  impact: FloodImpact;
}

export interface IFloodExtentRepository {
  findById(id: string): Promise<FloodExtentRecord | null>;
  /** Null when the shape is smaller or larger than a flood can be (SURVEY_LIMITS.extentAreaM2). */
  create(input: NewFloodExtent): Promise<FloodExtentDto | null>;
  findGeoJson(query: LayerGeoJsonQuery): Promise<FloodExtentFeatureCollection>;
  impactOf(id: string): Promise<FloodImpact | null>;
  markReceded(id: string, by: string): Promise<FloodExtentDto | null>;
  /** Undoes markReceded: null when the flood isn't there or isn't receded. */
  markActive(id: string, by: string): Promise<FloodExtentDto | null>;
  findPeople(id: string): Promise<FloodPeople | null>;
  /** The buildings, road stretches and facilities inside the flood, as shapes to draw (capped). */
  impactFeatures(id: string): Promise<FloodImpactFeatureCollection | null>;
  delete(id: string): Promise<boolean>;
  /** Floods recorded in the last `days` days that have not receded, newest first, for the public alert map. */
  findActive(days: number, limit: number): Promise<PublicFloodPoint[]>;
  /** Every flood in an LGA or ward (receded ones too), newest first: `items` is capped at `limit`, the totals are not. */
  findHistory(areaId: string, limit: number): Promise<FloodHistory>;
}

// ---------- drainage ----------

export interface DrainageDto {
  id: string;
  kind: DrainageKind;
  condition: DrainageCondition;
  name: string | null;
  widthM: number | null;
  depthM: number | null;
  /** Length of a walked drain, in metres; null for a single spot. */
  lengthM: number | null;
  note: string | null;
  method: RecordMethod;
  /** Lines only: which way the water runs along it; null when nobody said. */
  flowDirection: FlowDirection | null;
  /** A culvert's (or any spot's) pipe: its inside width, what it is made of, how many side by side. */
  diameterM: number | null;
  material: DrainMaterial | null;
  barrels: number | null;
  wardId: string | null;
  lgaId: string | null;
  /** When someone last looked at it: set on saving and on every re-inspection. */
  lastCheckedAt: string;
  /** Where it starts (a line) or is (a spot). */
  longitude: number;
  latitude: number;
}

export interface NewDrainage {
  countryCode: string;
  wardId: string | null;
  lgaId: string | null;
  kind: DrainageKind;
  condition: DrainageCondition;
  name: string | null;
  widthM: number | null;
  depthM: number | null;
  note: string | null;
  method: RecordMethod;
  flowDirection: FlowDirection | null;
  diameterM: number | null;
  material: DrainMaterial | null;
  barrels: number | null;
  points: LonLat[];
  recordedBy: string;
}

export interface DrainageChanges {
  condition: DrainageCondition;
  name: string | null;
  widthM: number | null;
  depthM: number | null;
  note: string | null;
  flowDirection: FlowDirection | null;
  diameterM: number | null;
  material: DrainMaterial | null;
  barrels: number | null;
}

/** Who looked, and from where: kept with every inspection (drain_inspections). */
export interface InspectionContext {
  inspectedBy: string;
  inspectorName: string | null;
  inspectorRole: string;
  conditionBefore: DrainageCondition;
  /** What the inspector wrote about this check (the drain's own note is separate). */
  note: string | null;
  /** Where the inspector's phone was, if it shared its position. */
  point: LonLat | null;
  accuracyM: number | null;
}

/** One inspection, as the drain's history lists it (staff-only: it names people). */
export interface DrainInspectionDto {
  id: string;
  inspectedAt: string;
  inspectedBy: string | null;
  inspectorName: string | null;
  inspectorRole: string;
  conditionBefore: DrainageCondition;
  conditionAfter: DrainageCondition;
  note: string | null;
  /** How far the inspector stood from the drain, in metres; null when the phone didn't share where it was. */
  distanceM: number | null;
  accuracyM: number | null;
  photoCount: number;
}

/** A person as staff see them on a record: their name and role, never their email. */
export interface PersonRef {
  id: string | null;
  name: string | null;
  role: string | null;
}

/** Who recorded a drain and who last checked it. */
export interface DrainPeople {
  recordedBy: PersonRef | null;
  lastCheckedBy: PersonRef | null;
  lastCheckedAt: string;
}

/** Who recorded a flood, and who called it over (or not over). */
export interface FloodPeople {
  recordedBy: PersonRef | null;
  recededBy: PersonRef | null;
  recededAt: string | null;
  reopenedBy: PersonRef | null;
  reopenedAt: string | null;
}

/** One drain from a drainage plan file, checked and ready to store. */
export interface ImportedDrain {
  /** The plan's own id for it (its feature id or `ref`): what stops a second upload adding it twice. */
  sourceRef: string;
  kind: DrainageKind;
  condition: DrainageCondition;
  name: string | null;
  widthM: number | null;
  depthM: number | null;
  diameterM: number | null;
  material: DrainMaterial | null;
  barrels: number | null;
  flowDirection: FlowDirection | null;
  note: string | null;
  points: LonLat[];
  /** YYYY-MM-DD: when it was last seen, as the plan says (or the plan's own date): its "last checked". */
  checkedAt: string;
}

export interface DrainageImportReport {
  featuresInFile: number;
  inserted: number;
  alreadyPresent: number;
  /** Left out before or by the database, by reason. */
  rejected: Record<string, number>;
}

export interface DrainageRecord extends DrainageChanges {
  id: string;
  kind: DrainageKind;
  wardId: string | null;
  lgaId: string | null;
  recordedBy: string | null;
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
  method: RecordMethod;
  flowDirection: FlowDirection | null;
  diameterM: number | null;
  material: DrainMaterial | null;
  barrels: number | null;
  /** Photos on the drain and its inspections (seen only with photos.view). */
  photoCount: number;
  /** The LGA and ward it is filed under (at its start), so a place's page can draw only its own drains. */
  lgaId: string | null;
  wardId: string | null;
}

/** One drain in a place's list. No note or recorder: the same as the map layer shows. */
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
  /** Where it starts (a line) or is (a spot), to open it on the map. */
  longitude: number;
  latitude: number;
}

/** The drainage recorded in an LGA or ward: how much of it needs attention, and the drains themselves, the worst first. */
export interface DrainageSummary {
  total: number;
  /** Blocked, overflowing or damaged: water is not getting through. */
  needAttention: number;
  partlyBlocked: number;
  clear: number;
  /** When any of it was last looked at; null when there is none. */
  lastCheckedAt: string | null;
  items: DrainageSummaryItem[];
}

export type DrainageFeatureCollection = LayerFeatureCollection<Point | LineString, DrainageFeatureProperties>;

export interface IDrainageRepository {
  findById(id: string): Promise<DrainageRecord | null>;
  /** Null when a walked drain is shorter or longer than a drain can be (SURVEY_LIMITS.drainLengthM). */
  create(input: NewDrainage): Promise<DrainageDto | null>;
  /** Saves an inspection: the drain's new state and its drain_inspections row, in one statement. */
  inspect(id: string, changes: DrainageChanges, inspection: InspectionContext): Promise<{ drain: DrainageDto; inspectionId: string; distanceM: number | null } | null>;
  findInspections(id: string, limit: number): Promise<DrainInspectionDto[]>;
  findPeople(id: string): Promise<DrainPeople | null>;
  /** Stores a drainage plan's drains; one already stored under the same sourceRef is left alone. */
  importMany(
    drains: ImportedDrain[],
    context: { countryCode: string; recordedBy: string; wardLevel: number },
  ): Promise<{ inserted: number; alreadyPresent: number; rejected: Record<string, number> }>;
  findGeoJson(query: LayerGeoJsonQuery): Promise<DrainageFeatureCollection>;
  /** The drainage in an LGA or ward: totals over all of it, and the first `limit` drains, those needing attention first. */
  findSummary(areaId: string, limit: number): Promise<DrainageSummary>;
  delete(id: string): Promise<boolean>;
}
