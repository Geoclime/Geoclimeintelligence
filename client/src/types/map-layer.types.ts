import type { FeatureCollection, Geometry, MultiLineString, MultiPolygon, Point } from "geojson";
import type { BBox } from "./admin-unit.types";
import type { DataSource } from "./data-source.types";

/** The feature layers drawn over the boundaries. Mirrors MapLayerId in server/src/modules/map-layers/layer-rules.ts. */
export type OverlayLayerId = "roads" | "waterways" | "settlements" | "infrastructure";

/** Mirrors FACILITY_TYPES in server/src/modules/map-layers/layer-rules.ts. */
export type FacilityType =
  | "health"
  | "emergency"
  | "education"
  | "government"
  | "market"
  | "transport"
  | "community"
  | "worship"
  | "water"
  | "telecom";

export type WaterClass = "river" | "creek" | "other";

/**
 * A map-layer reply: GeoJSON plus `truncated`, true when more features were in view than one
 * response may hold, so the screen can say "zoom in for more" instead of showing a silent partial.
 */
export type LayerFeatureCollection<G extends Geometry, P> = FeatureCollection<G, P> & { truncated: boolean };

/** Mirror RoadFeatureProperties etc. in server/src/modules/map-layers/map-layer.types.ts. */
export interface RoadFeatureProperties {
  id: string;
  name: string | null;
  roadClass: string;
  surface: string | null;
  oneway: string | null;
  isBridge: boolean;
}

export interface WaterwayFeatureProperties {
  id: string;
  name: string | null;
  waterClass: WaterClass;
  waterwayType: string | null;
  tunnel: string | null;
}

export interface SettlementFeatureProperties {
  id: string;
  name: string;
  isPrimary: boolean;
}

export type RoadFeatureCollection = LayerFeatureCollection<MultiLineString, RoadFeatureProperties>;
export type WaterwayFeatureCollection = LayerFeatureCollection<MultiLineString | MultiPolygon, WaterwayFeatureProperties>;
export type SettlementFeatureCollection = LayerFeatureCollection<Point, SettlementFeatureProperties>;

export interface InfrastructureFeatureProperties {
  id: string;
  name: string | null;
  facilityType: FacilityType;
  /** The OSM class as delivered, e.g. "clinic" within "health". */
  osmClass: string;
}

export type InfrastructureFeatureCollection = LayerFeatureCollection<Point, InfrastructureFeatureProperties>;

/** Which collection each layer's endpoint returns. */
export interface OverlayCollections {
  roads: RoadFeatureCollection;
  waterways: WaterwayFeatureCollection;
  settlements: SettlementFeatureCollection;
  infrastructure: InfrastructureFeatureCollection;
}

/** GET /api/v1/{roads,waterways,settlements,infrastructure}/geojson. bbox is required: the server refuses a request without one. */
export interface OverlayLayerParams {
  bbox: BBox;
  zoom?: number;
}

/** GET /api/v1/map-layers: a layer, how much of it is loaded, and where its data came from. */
export interface MapLayerInfo {
  id: OverlayLayerId;
  label: string;
  featureCount: number;
  sources: DataSource[];
}

export type MapLayerUploadKind = OverlayLayerId | "zip";

export interface UploadMapLayerInput {
  file: File;
  countryCode: string;
  layer: MapLayerUploadKind;
  sourceId?: string;
  wardLevel?: number;
}

export interface MapLayerLoadItemReport {
  layer: "roads" | "waterways" | "waterway areas" | "settlements" | "infrastructure";
  file: string;
  sourceId: string | null;
  sourceCreated: boolean;
  featuresInFile: number;
  rejected: Record<string, number>;
  inserted: number;
  alreadyPresent: number;
  relinked: number;
  unlinked: number;
}

export interface MapLayerLoadReport {
  dryRun: boolean;
  layers: MapLayerLoadItemReport[];
}

export interface ClearMapLayerInput {
  countryCode: string;
  layers: OverlayLayerId[];
}

export interface MapLayerClearReport {
  dryRun: boolean;
  deleted: Partial<Record<OverlayLayerId, number>>;
}
