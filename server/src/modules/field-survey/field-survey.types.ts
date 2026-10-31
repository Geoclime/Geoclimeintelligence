import type { LineString, MultiPolygon, Point } from "geojson";
import type { LonLat } from "../../common/geo/geo";
import type { FacilityType } from "../map-layers/layer-rules";
import type { LayerFeatureCollection, LayerGeoJsonQuery } from "../map-layers/map-layer.types";
import type { DrainageCondition, DrainageKind, FloodDepth, SurveyMethod } from "./survey-rules";

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
  markReceded(id: string): Promise<FloodExtentDto | null>;
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
  method: SurveyMethod;
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
  method: SurveyMethod;
  points: LonLat[];
  recordedBy: string;
}

export interface DrainageChanges {
  condition: DrainageCondition;
  name: string | null;
  widthM: number | null;
  depthM: number | null;
  note: string | null;
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
}

export type DrainageFeatureCollection = LayerFeatureCollection<Point | LineString, DrainageFeatureProperties>;

export interface IDrainageRepository {
  findById(id: string): Promise<DrainageRecord | null>;
  /** Null when a walked drain is shorter or longer than a drain can be (SURVEY_LIMITS.drainLengthM). */
  create(input: NewDrainage): Promise<DrainageDto | null>;
  update(id: string, changes: DrainageChanges): Promise<DrainageDto | null>;
  findGeoJson(query: LayerGeoJsonQuery): Promise<DrainageFeatureCollection>;
  delete(id: string): Promise<boolean>;
}
