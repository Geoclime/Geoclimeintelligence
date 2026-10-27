import type { FeatureCollection, Geometry, MultiLineString, MultiPolygon, Point } from "geojson";
import type { BBox } from "../../common/geo/geo";
import type { DataSourceDto } from "../data-sources/data-source.types";
import type { FacilityType, MapLayerId, WaterClass } from "./layer-rules";

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
  /** The OSM class as delivered, e.g. "clinic" within "health". */
  osmClass: string;
}

export type InfrastructureFeatureCollection = LayerFeatureCollection<Point, InfrastructureFeatureProperties>;

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
