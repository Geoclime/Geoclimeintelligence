import type { FeatureCollection, MultiPolygon } from "geojson";
import type { DataSource } from "./data-source.types";

/** [minLon, minLat, maxLon, maxLat], EPSG:4326: GeoJSON's bbox order. */
export type BBox = [number, number, number, number];

/** [longitude, latitude]: GeoJSON's coordinate order. */
export type LonLat = [number, number];

/** Mirrors AdminUnitRef in server/src/modules/admin-units/admin-unit.types.ts. */
export interface AdminUnitRef {
  id: string;
  countryCode: string;
  level: number;
  levelName: string;
  unitName: string;
  unitCode: string | null;
}

/** A list row: never a shape, only a bbox + centroid summary (backend standard section 10). */
export interface AdminUnitSummary extends AdminUnitRef {
  parentId: string | null;
  sourceId: string;
  childCount: number;
  bbox: BBox;
  centroid: LonLat;
}

/** GET /api/v1/admin-units/:id: the only list-free reply that carries the full shape. */
export interface AdminUnitDetail extends AdminUnitSummary {
  parent: AdminUnitRef | null;
  source: DataSource | null;
  geometry: MultiPolygon;
}

/** GET /api/v1/admin-units/locate: every area containing the point, top level first. */
export interface LocateResult {
  point: LonLat;
  units: AdminUnitRef[];
}

export interface AdminUnitListParams {
  countryCode?: string;
  level?: number;
  parentId?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export interface ChildListParams {
  page: number;
  pageSize: number;
}

/** GET /api/v1/admin-units/geojson. bbox is required: the server refuses a request without one. */
export interface AdminUnitLayerParams {
  level: number;
  bbox: BBox;
  parentId?: string;
  zoom?: number;
}

export interface AdminUnitFeatureProperties {
  id: string;
  unitName: string;
  unitCode: string | null;
  level: number;
  levelName: string;
  parentId: string | null;
  sourceId: string;
}

export type AdminUnitFeatureCollection = FeatureCollection<MultiPolygon, AdminUnitFeatureProperties>;
