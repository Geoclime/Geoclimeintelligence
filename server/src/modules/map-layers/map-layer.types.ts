import type { FeatureCollection, Geometry, MultiLineString, MultiPolygon, Point } from "geojson";
import type { BBox } from "../../common/geo/geo";
import type { DataSourceDto } from "../data-sources/data-source.types";
import type { FacilityOrigin, FacilityType, MapLayerId, WaterClass } from "./layer-rules";

/**
 * A map-layer reply: GeoJSON plus `truncated`. It is true when more features were in view than
 * one response may hold (layer-rules.ts), so the screen can say "zoom in for more" instead of
 * silently showing a partial layer.
 */
export type LayerFeatureCollection<G extends Geometry, P> = FeatureCollection<G, P> & { truncated: boolean };

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
  /** The OSM class as delivered, e.g. "clinic" within "health". For a place saved by hand, the kind chosen. */
  osmClass: string;
  /** 'manual' for a place an administrator saved from the map, so the screen can offer to edit it. */
  origin: FacilityOrigin;
  /** What the administrator wrote about a place saved by hand; always null for an imported one. */
  note: string | null;
}

export type InfrastructureFeatureCollection = LayerFeatureCollection<Point, InfrastructureFeatureProperties>;

/** A place an administrator saved from the map, as the save, edit and delete routes return it. */
export interface FacilityDto {
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

export interface NewFacility {
  countryCode: string;
  adminUnitId: string | null;
  name: string;
  facilityType: FacilityType;
  osmClass: string;
  note: string | null;
  longitude: number;
  latitude: number;
  sourceId: string;
  createdBy: string;
}

export interface FacilityChanges {
  name: string;
  facilityType: FacilityType;
  osmClass: string;
  note: string | null;
}

/** The standing data source every place saved by hand points at. */
export interface ManualFacilitySource {
  provider: string;
  datasetName: string;
  url: string;
  license: string;
  notes: string;
  createdBy: string;
}

/** A stored facility as the service reads it before changing it. */
export interface FacilityRecord {
  id: string;
  name: string | null;
  facilityType: FacilityType;
  osmClass: string;
  note: string | null;
  origin: FacilityOrigin;
}

/**
 * The write side of the infrastructure layer: places saved by hand. A separate interface from
 * IInfrastructureRepository, which the map reads through, so the read fakes stay as they are.
 */
export interface IFacilityRepository {
  /** The row without its shape: enough to check where it came from (origin) and to merge a change into it. */
  findById(id: string): Promise<FacilityRecord | null>;
  /** The id of the standing source for places saved by hand, created the first time it is needed. */
  ensureManualSource(input: ManualFacilitySource): Promise<string>;
  create(input: NewFacility): Promise<FacilityDto>;
  /** Null when no saved-by-hand place has that id; an imported row is never changed. */
  update(id: string, changes: FacilityChanges): Promise<FacilityDto | null>;
  /** False when no saved-by-hand place has that id; an imported row is never deleted. */
  delete(id: string): Promise<boolean>;
}

export interface BuildingFeatureProperties {
  id: string;
  name: string | null;
  /** The OSM building tag when it says more than "yes" (house, school, church...). */
  buildingType: string | null;
}

export type BuildingFeatureCollection = LayerFeatureCollection<MultiPolygon, BuildingFeatureProperties>;

/** The visible area, and optionally the zoom, which thins the layer and simplifies its shapes. */
export interface LayerGeoJsonQuery {
  bbox: BBox;
  zoom?: number;
}

/** How many features a layer holds and which sources they came from. */
export interface LayerSummary {
  featureCount: number;
  sourceIds: string[];
}

/** One entry of GET /api/v1/map-layers: a layer, its size, and where its data came from. */
export interface MapLayerInfoDto {
  id: MapLayerId;
  label: string;
  featureCount: number;
  sources: DataSourceDto[];
}

/** What services depend on, so they can be unit-tested with an in-memory fake (section 2). */
export interface IRoadRepository {
  findGeoJson(query: LayerGeoJsonQuery): Promise<RoadFeatureCollection>;
  summarise(): Promise<LayerSummary>;
}

export interface IWaterwayRepository {
  findGeoJson(query: LayerGeoJsonQuery): Promise<WaterwayFeatureCollection>;
  summarise(): Promise<LayerSummary>;
}

export interface ISettlementRepository {
  findGeoJson(query: LayerGeoJsonQuery): Promise<SettlementFeatureCollection>;
  summarise(): Promise<LayerSummary>;
}

export interface IInfrastructureRepository {
  findGeoJson(query: LayerGeoJsonQuery): Promise<InfrastructureFeatureCollection>;
  summarise(): Promise<LayerSummary>;
}

export interface IBuildingRepository {
  findGeoJson(query: LayerGeoJsonQuery): Promise<BuildingFeatureCollection>;
  summarise(): Promise<LayerSummary>;
}
