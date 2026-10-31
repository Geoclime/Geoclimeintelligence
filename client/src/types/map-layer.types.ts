import type { FeatureCollection, Geometry, MultiLineString, MultiPolygon, Point } from "geojson";
import type { BBox } from "./admin-unit.types";
import type { DataSource } from "./data-source.types";

/** The feature layers drawn over the boundaries. Mirrors MapLayerId in server/src/modules/map-layers/layer-rules.ts. */
export type OverlayLayerId = "roads" | "waterways" | "settlements" | "infrastructure" | "buildings";

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

/** Where a facility came from: the OpenStreetMap import, or an administrator saving it from the map. */
export type FacilityOrigin = "import" | "manual";

export interface InfrastructureFeatureProperties {
  id: string;
  name: string | null;
  facilityType: FacilityType;
  /** The OSM class as delivered, e.g. "clinic" within "health". For a place saved by hand, the kind chosen. */
  osmClass: string;
  origin: FacilityOrigin;
  /** What the administrator wrote about a place saved by hand; always null for an imported one. */
  note: string | null;
}

export type InfrastructureFeatureCollection = LayerFeatureCollection<Point, InfrastructureFeatureProperties>;

/** A place an administrator saved from the map. Mirrors FacilityDto in server/src/modules/map-layers/map-layer.types.ts. */
export interface SavedPlace {
  id: string;
  name: string | null;
  facilityType: FacilityType;
  osmClass: string;
  note: string | null;
  origin: FacilityOrigin;
  longitude: number;
  latitude: number;
  /** The ward the place sits in; null when the point is in no loaded ward. */
  adminUnitId: string | null;
  createdAt: string;
}

/** POST /api/v1/infrastructure. `kind` is a facility class such as "hospital" (utils/facility-kinds.ts). */
export interface NewPlaceBody {
  name: string;
  kind: string;
  note?: string;
  longitude: number;
  latitude: number;
}

/** PATCH /api/v1/infrastructure/:id. A blank note clears it. The point can't be moved. */
export interface UpdatePlaceBody {
  name?: string;
  kind?: string;
  note?: string;
}

/** A hand-saved place on the map: what the popup and the edit form need. */
export interface PlaceOnMap {
  id: string;
  name: string | null;
  facilityType: FacilityType;
  osmClass: string;
  note: string | null;
  /** [longitude, latitude] */
  point: [number, number];
}

/** One drawn feature under a click: which layer, and the properties it was built from. */
export interface ClickedFeature {
  layerId: string;
  properties: Record<string, unknown>;
  /** [longitude, latitude] of a point feature; null for any other shape. */
  coordinates: [number, number] | null;
}

export interface BuildingFeatureProperties {
  id: string;
  name: string | null;
  /** The OSM building tag when it says more than "yes" (house, school, church...). */
  buildingType: string | null;
}

export type BuildingFeatureCollection = LayerFeatureCollection<MultiPolygon, BuildingFeatureProperties>;

/** Which collection each layer's endpoint returns. */
export interface OverlayCollections {
  roads: RoadFeatureCollection;
  waterways: WaterwayFeatureCollection;
  settlements: SettlementFeatureCollection;
  infrastructure: InfrastructureFeatureCollection;
  buildings: BuildingFeatureCollection;
}

/** GET /api/v1/{roads,waterways,settlements,infrastructure,buildings}/geojson. bbox is required: the server refuses a request without one. */
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
  /** Load a cut-short GeoPackage even if some of its rows are missing (OpenStreetMap layers only). */
  acceptPartial?: boolean;
}

export interface MapLayerLoadItemReport {
  layer: "roads" | "waterways" | "waterway areas" | "settlements" | "infrastructure" | "buildings";
  /** E.g. that the file was recovered from a cut-short copy. */
  notes?: string[];
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
