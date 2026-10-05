import type { FeatureCollection, MultiPolygon } from "geojson";
import type { RegionHierarchy } from "../../common/access/region-access";
import type { BBox, LonLat } from "../../common/geo/geo";
import type { PageMeta } from "../../common/response/api-response";
import type { DataSourceDto } from "../data-sources/data-source.types";

/** The smallest useful description of an area: enough to name and link it, no shape. */
export interface AdminUnitRef {
  id: string;
  countryCode: string;
  level: number;
  levelName: string;
  unitName: string;
  unitCode: string | null;
}

/** A row in a list. Never a shape: only a bbox + centroid summary (section 10). */
export interface AdminUnitSummary extends AdminUnitRef {
  parentId: string | null;
  sourceId: string;
  childCount: number;
  bbox: BBox;
  centroid: LonLat;
}

/** One area in full: the only reply that carries its shape (section 10's detail endpoints). */
export interface AdminUnitDetail extends AdminUnitSummary {
  parent: AdminUnitRef | null;
  source: DataSourceDto | null;
  geometry: MultiPolygon;
}

export interface LocateResult {
  point: LonLat;
  /** Every area containing the point, top level first (state, LGA, ward). */
  units: AdminUnitRef[];
}

export interface AdminUnitFilter {
  countryCode?: string;
  level?: number;
  parentId?: string;
  /** Case-insensitive "name contains". */
  q?: string;
  page: number;
  pageSize: number;
}

export interface GeoJsonLayerQuery {
  level: number;
  bbox: BBox;
  countryCode?: string;
  parentId?: string;
  /** Map zoom; when given, shapes are simplified to roughly one screen pixel. */
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

/** Units already in a country at one level, for the import checks' parent and duplicate lookups. */
export interface AdminUnitLookupRow extends AdminUnitRef {
  parentId: string | null;
}

/** What services depend on, so they can be unit-tested with an in-memory fake (section 2). */
export interface IAdminUnitRepository extends RegionHierarchy {
  findSummaries(filter: AdminUnitFilter): Promise<{ items: AdminUnitSummary[]; meta: PageMeta }>;
  findSummaryById(id: string): Promise<AdminUnitSummary | null>;
  /** One shape only, as GeoJSON. */
  findGeometry(id: string): Promise<MultiPolygon | null>;
  /** Point-in-polygon with ST_Contains, run in the database (section 8). */
  findContaining(lon: number, lat: number, level?: number): Promise<AdminUnitRef[]>;
  findGeoJson(query: GeoJsonLayerQuery): Promise<AdminUnitFeatureCollection>;
  findLookupRows(countryCode: string, level: number): Promise<AdminUnitLookupRow[]>;
  exists(id: string): Promise<boolean>;
}

export function toRef(unit: AdminUnitRef): AdminUnitRef {
  const { id, countryCode, level, levelName, unitName, unitCode } = unit;
  return { id, countryCode, level, levelName, unitName, unitCode };
}
