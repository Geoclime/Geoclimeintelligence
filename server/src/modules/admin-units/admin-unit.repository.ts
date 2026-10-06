import type { MultiPolygon } from "geojson";
import type { BBox, LonLat } from "../../common/geo/geo";
import { BaseRepository } from "../../common/repository/base.repository";
import type { PageMeta } from "../../common/response/api-response";
import { AdminUnit } from "./admin-unit.entity";
import type {
  AdminUnitFeatureCollection,
  AdminUnitFilter,
  AdminUnitLookupRow,
  AdminUnitRef,
  AdminUnitSummary,
  GeoJsonLayerQuery,
  IAdminUnitRepository,
} from "./admin-unit.types";

// Every spatial operation here runs in PostGIS, never in JS (section 8). Shapes leave the
// database only through findGeometry (one area) and findGeoJson (a bbox-limited map layer).

const REF_COLUMNS = `au.id, au.country_code AS "countryCode", au.level, au.level_name AS "levelName",
  au.unit_name AS "unitName", au.unit_code AS "unitCode"`;

const SUMMARY_COLUMNS = `${REF_COLUMNS}, au.parent_id AS "parentId", au.source_id AS "sourceId",
  (SELECT count(*) FROM admin_units c WHERE c.parent_id = au.id)::int AS "childCount",
  ARRAY[ST_XMin(au.geom), ST_YMin(au.geom), ST_XMax(au.geom), ST_YMax(au.geom)] AS bbox,
  ARRAY[ST_X(ST_Centroid(au.geom)), ST_Y(ST_Centroid(au.geom))] AS centroid`;

/** Hierarchies are shallow (a country has at most 6 levels); the cap stops a bad parent loop. */
const MAX_DEPTH = 10;

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function toSummary(row: AdminUnitSummary): AdminUnitSummary {
  return {
    ...row,
    bbox: row.bbox.map(round6) as BBox,
    centroid: row.centroid.map(round6) as LonLat,
  };
}

/** Escapes LIKE wildcards so a search for "50%" means the literal text. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

export class AdminUnitRepository extends BaseRepository<AdminUnit> implements IAdminUnitRepository {
  private static _instance?: AdminUnitRepository;
  static get Instance(): AdminUnitRepository {
    return (this._instance ??= new AdminUnitRepository());
  }

  protected readonly entity = AdminUnit;

  async findSummaries(filter: AdminUnitFilter): Promise<{ items: AdminUnitSummary[]; meta: PageMeta }> {
    const where = `WHERE ($1::char(3) IS NULL OR au.country_code = $1)
        AND ($2::smallint IS NULL OR au.level = $2)
        AND ($3::uuid IS NULL OR au.parent_id = $3)
        AND ($4::text IS NULL OR au.unit_name ILIKE $4)`;
    const params = [
      filter.countryCode ?? null,
      filter.level ?? null,
      filter.parentId ?? null,
      filter.q ? likePattern(filter.q) : null,
    ];

    const [rows, [countRow]] = await Promise.all([
      this.repo.query(
        `SELECT ${SUMMARY_COLUMNS} FROM admin_units au ${where}
          ORDER BY au.unit_name, au.id LIMIT $5 OFFSET $6`,
        [...params, filter.pageSize, (filter.page - 1) * filter.pageSize],
      ) as Promise<AdminUnitSummary[]>,
      this.repo.query(`SELECT count(*)::int AS total FROM admin_units au ${where}`, params) as Promise<{ total: number }[]>,
    ]);

    return {
      items: rows.map(toSummary),
      meta: { page: filter.page, pageSize: filter.pageSize, total: countRow?.total ?? 0 },
    };
  }

  /** Thin, named views over findSummaries, as listed in step B5 of the Phase 2 guide. */
  findChildren(parentId: string, page: number, pageSize: number) {
    return this.findSummaries({ parentId, page, pageSize });
  }

  findByLevel(level: number, page: number, pageSize: number) {
    return this.findSummaries({ level, page, pageSize });
  }

  async findSummaryById(id: string): Promise<AdminUnitSummary | null> {
    const rows: AdminUnitSummary[] = await this.repo.query(
      `SELECT ${SUMMARY_COLUMNS} FROM admin_units au WHERE au.id = $1`,
      [id],
    );
    return rows[0] ? toSummary(rows[0]) : null;
  }

  async findGeometry(id: string): Promise<MultiPolygon | null> {
    const rows: { geometry: MultiPolygon }[] = await this.repo.query(
      `SELECT ST_AsGeoJSON(geom, 6)::json AS geometry FROM admin_units WHERE id = $1`,
      [id],
    );
    return rows[0]?.geometry ?? null;
  }

  findContaining(lon: number, lat: number, level?: number): Promise<AdminUnitRef[]> {
    // ST_Contains uses idx_admin_units_geom; the point is built in SRID 4326 like every shape.
    return this.repo.query(
      `SELECT ${REF_COLUMNS} FROM admin_units au
        WHERE ST_Contains(au.geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
          AND ($3::smallint IS NULL OR au.level = $3)
        ORDER BY au.level`,
      [lon, lat, level ?? null],
    );
  }

  async findGeoJson(query: GeoJsonLayerQuery): Promise<AdminUnitFeatureCollection> {
    // About one screen pixel in degrees at this zoom (512px Mapbox tiles); 0 = full detail.
    const tolerance = query.zoom === undefined ? 0 : 180 / (512 * 2 ** query.zoom);
    const [minLon, minLat, maxLon, maxLat] = query.bbox;
    const rows: { fc: AdminUnitFeatureCollection }[] = await this.repo.query(
      `WITH view AS (SELECT ST_MakeEnvelope($2, $3, $4, $5, 4326) AS box)
       SELECT json_build_object(
         'type', 'FeatureCollection',
         'features', COALESCE(json_agg(json_build_object(
           'type', 'Feature',
           'id', au.id,
           'geometry', ST_AsGeoJSON(
             CASE WHEN $6::float8 > 0 THEN ST_Multi(ST_SimplifyPreserveTopology(au.geom, $6::float8)) ELSE au.geom END,
             6)::json,
           'properties', json_build_object(
             'id', au.id, 'unitName', au.unit_name, 'unitCode', au.unit_code, 'level', au.level,
             'levelName', au.level_name, 'parentId', au.parent_id, 'sourceId', au.source_id)
         ) ORDER BY au.unit_name), '[]'::json)
       ) AS fc
       FROM admin_units au, view
       WHERE au.level = $1
         AND au.geom && view.box AND ST_Intersects(au.geom, view.box)
         AND ($7::char(3) IS NULL OR au.country_code = $7)
         AND ($8::uuid IS NULL OR au.parent_id = $8)`,
      [query.level, minLon, minLat, maxLon, maxLat, tolerance, query.countryCode ?? null, query.parentId ?? null],
    );
    return rows[0]?.fc ?? { type: "FeatureCollection", features: [] };
  }

  findLookupRows(countryCode: string, level: number): Promise<AdminUnitLookupRow[]> {
    return this.repo.query(
      `SELECT ${REF_COLUMNS}, au.parent_id AS "parentId" FROM admin_units au
        WHERE au.country_code = $1 AND au.level = $2 ORDER BY au.unit_name`,
      [countryCode, level],
    );
  }

  async exists(id: string): Promise<boolean> {
    return this.repo.existsBy({ id });
  }

  /** Region scoping (section 7): walks parent_id upwards from the target. */
  async isDescendantOrSelf(targetAdminUnitId: string, ancestorAdminUnitId: string): Promise<boolean> {
    const rows: { found: boolean }[] = await this.repo.query(
      `WITH RECURSIVE chain AS (
         SELECT id, parent_id, 1 AS depth FROM admin_units WHERE id = $1
         UNION ALL
         SELECT p.id, p.parent_id, c.depth + 1 FROM admin_units p JOIN chain c ON p.id = c.parent_id
          WHERE c.depth < ${MAX_DEPTH}
       )
       SELECT EXISTS (SELECT 1 FROM chain WHERE id = $2) AS found`,
      [targetAdminUnitId, ancestorAdminUnitId],
    );
    return rows[0]?.found === true;
  }

  /** The root plus every descendant. Empty if the root doesn't exist, so a stale scope sees nothing. */
  async subtreeIds(rootAdminUnitId: string): Promise<string[]> {
    const rows: { id: string }[] = await this.repo.query(
      `WITH RECURSIVE tree AS (
         SELECT id, 1 AS depth FROM admin_units WHERE id = $1
         UNION ALL
         SELECT c.id, t.depth + 1 FROM admin_units c JOIN tree t ON c.parent_id = t.id
          WHERE t.depth < ${MAX_DEPTH}
       )
       SELECT id FROM tree`,
      [rootAdminUnitId],
    );
    return rows.map((row) => row.id);
  }
}
