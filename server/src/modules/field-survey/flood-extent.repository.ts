import { BaseRepository } from "../../common/repository/base.repository";
import { DEFAULT_WARD_LEVEL, FACILITY_TYPES } from "../map-layers/layer-rules";
import type { LayerGeoJsonQuery } from "../map-layers/map-layer.types";
import type {
  FloodExtentDto,
  FloodExtentFeatureCollection,
  FloodHistory,
  FloodHistoryItem,
  FloodImpact,
  IFloodExtentRepository,
  NewFloodExtent,
  PublicFloodPoint,
} from "./field-survey.types";
import { FloodExtent } from "./flood-extent.entity";
import { SURVEY_LIMITS } from "./survey-rules";

// Every spatial operation runs in PostGIS, never in JS (section 8): the ring is built, repaired and
// measured in the database, on the spheroid, so an area is never taken on the browser's word.

// An UPDATE or DELETE run through TypeORM's query() comes back as [rows, rowCount], not as the rows, so
// each one is wrapped in a CTE and read back with a SELECT, as the other repositories do (INSERT is fine).

/** What every write hands back (as the select list of the row it wrote), with a point inside the shape to open it on the map. */
const RETURNING = `
  id, area_m2 AS "areaM2", perimeter_m AS "perimeterM", depth, note, method, point_count AS "pointCount",
  accuracy_m AS "accuracyM", ward_id AS "wardId", lga_id AS "lgaId", receded_at AS "recededAt",
  observed_at AS "observedAt", ST_X(ST_PointOnSurface(geom)) AS longitude, ST_Y(ST_PointOnSurface(geom)) AS latitude`;

type FloodExtentRow = Omit<FloodExtentDto, "receded" | "recededAt" | "observedAt"> & { recededAt: Date | null; observedAt: Date };

function toDto(row: FloodExtentRow): FloodExtentDto {
  return {
    ...row,
    // A real column carries single precision, so 7.3 comes back as 7.300000190734863.
    accuracyM: row.accuracyM === null ? null : Math.round(row.accuracyM * 10) / 10,
    receded: row.recededAt !== null,
    recededAt: row.recededAt?.toISOString() ?? null,
    observedAt: row.observedAt.toISOString(),
  };
}

export class FloodExtentRepository extends BaseRepository<FloodExtent> implements IFloodExtentRepository {
  private static _instance?: FloodExtentRepository;
  static get Instance(): FloodExtentRepository {
    return (this._instance ??= new FloodExtentRepository());
  }

  protected readonly entity = FloodExtent;

  async create(input: NewFloodExtent): Promise<FloodExtentDto | null> {
    // The walked points become a closed ring, then a polygon. A track that crosses itself is repaired
    // (ST_MakeValid) into a MultiPolygon, so a figure-of-eight keeps both loops. Nothing is stored if
    // the area is outside what a flood can be: the SELECT's WHERE then returns no row.
    const rows: FloodExtentRow[] = await this.repo.query(
      `WITH pts AS (
         SELECT ST_SetSRID(ST_MakePoint((p->>0)::float8, (p->>1)::float8), 4326) AS pt, t.ord
           FROM json_array_elements($1::json) WITH ORDINALITY AS t(p, ord)
       ), line AS (
         SELECT ST_MakeLine(pt ORDER BY ord) AS g FROM pts
       ), ring AS (
         SELECT CASE WHEN ST_IsClosed(g) THEN g ELSE ST_AddPoint(g, ST_StartPoint(g)) END AS g FROM line
       ), shape AS (
         SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_MakePolygon(g)), 3)) AS g FROM ring
       ), measured AS (
         SELECT g, ST_Area(g::geography) AS area_m2, ST_Perimeter(g::geography) AS perimeter_m
           FROM shape WHERE NOT ST_IsEmpty(g)
       )
       INSERT INTO flood_extents (country_code, ward_id, lga_id, geom, area_m2, perimeter_m, method, depth, note,
                                  point_count, accuracy_m, recorded_by)
       SELECT $2::char(3), $3::uuid, $4::uuid, m.g, m.area_m2, m.perimeter_m, $5::varchar, $6::varchar, $7::varchar,
              $8::int, $9::real, $10::uuid
         FROM measured m
        WHERE m.area_m2 BETWEEN $11::float8 AND $12::float8
       RETURNING ${RETURNING}`,
      [
        JSON.stringify(input.points), input.countryCode, input.wardId, input.lgaId, input.method, input.depth, input.note,
        input.points.length, input.accuracyM, input.recordedBy, SURVEY_LIMITS.extentAreaM2.min, SURVEY_LIMITS.extentAreaM2.max,
      ],
    );
    return rows[0] ? toDto(rows[0]) : null;
  }

  async markReceded(id: string): Promise<FloodExtentDto | null> {
    const rows: FloodExtentRow[] = await this.repo.query(
      `WITH changed AS (
         UPDATE flood_extents SET receded_at = now(), updated_at = now()
          WHERE id = $1 AND receded_at IS NULL
          RETURNING *)
       SELECT ${RETURNING} FROM changed`,
      [id],
    );
    return rows[0] ? toDto(rows[0]) : null;
  }

  async markActive(id: string): Promise<FloodExtentDto | null> {
    // Only receded_at is cleared: observed_at stays, so the flood returns to exactly the state it had before it was
    // marked receded, including whether the public alert map still shows it (that looks at how recently it was recorded).
    const rows: FloodExtentRow[] = await this.repo.query(
      `WITH changed AS (
         UPDATE flood_extents SET receded_at = NULL, updated_at = now()
          WHERE id = $1 AND receded_at IS NOT NULL
          RETURNING *)
       SELECT ${RETURNING} FROM changed`,
      [id],
    );
    return rows[0] ? toDto(rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const [row]: { n: number }[] = await this.repo.query(`WITH gone AS (DELETE FROM flood_extents WHERE id = $1 RETURNING 1) SELECT count(*)::int AS n FROM gone`, [id]);
    return (row?.n ?? 0) > 0;
  }

  async findGeoJson(query: LayerGeoJsonQuery): Promise<FloodExtentFeatureCollection> {
    const [minLon, minLat, maxLon, maxLat] = query.bbox;
    const limit = SURVEY_LIMITS.featureCap;
    // Floods that are still going come first, so a cap, if it bites, drops the ones that receded. One
    // extra row is read only to learn whether it did. A receded flood leaves the map after a week.
    const rows: { fc: FloodExtentFeatureCollection }[] = await this.repo.query(
      `WITH view AS (SELECT ST_MakeEnvelope($1, $2, $3, $4, 4326) AS box),
            picked AS (
              SELECT e.id, e.geom, e.area_m2, e.depth, e.method, e.receded_at, e.observed_at, e.lga_id, e.ward_id,
                     row_number() OVER (ORDER BY (e.receded_at IS NOT NULL), e.observed_at DESC, e.id) AS n
                FROM flood_extents e, view
               WHERE e.geom && view.box AND ST_Intersects(e.geom, view.box)
                 AND (e.receded_at IS NULL OR e.receded_at > now() - ($6::int * interval '1 day'))
               ORDER BY (e.receded_at IS NOT NULL), e.observed_at DESC, e.id
               LIMIT $5::int + 1)
       SELECT json_build_object(
         'type', 'FeatureCollection',
         'truncated', COALESCE(max(n) > $5::int, false),
         'features', COALESCE(json_agg(json_build_object(
           'type', 'Feature',
           'id', id,
           'geometry', ST_AsGeoJSON(geom, 6)::json,
           'properties', json_build_object('id', id, 'areaM2', area_m2, 'depth', depth, 'method', method,
                                           'receded', receded_at IS NOT NULL, 'observedAt', observed_at,
                                           'lgaId', lga_id, 'wardId', ward_id)
         ) ORDER BY n) FILTER (WHERE n <= $5::int), '[]'::json)
       ) AS fc
       FROM picked`,
      [minLon, minLat, maxLon, maxLat, limit, SURVEY_LIMITS.recededVisibleDays],
    );
    return rows[0]?.fc ?? { type: "FeatureCollection", features: [], truncated: false };
  }

  async findActive(days: number, limit: number): Promise<PublicFloodPoint[]> {
    // For the public alert map, so the point is rounded to three decimals (about 100 m), as a published
    // report's is, and nothing about who recorded it or what they wrote leaves here.
    const rows: (Omit<PublicFloodPoint, "point" | "observedAt"> & { lon: number; lat: number; observedAt: Date })[] = await this.repo.query(
      `SELECT e.id,
              ROUND(ST_X(ST_PointOnSurface(e.geom))::numeric, 3)::float8 AS lon,
              ROUND(ST_Y(ST_PointOnSurface(e.geom))::numeric, 3)::float8 AS lat,
              ROUND(e.area_m2)::float8 AS "areaM2", e.depth, a.unit_name AS "lgaName", e.observed_at AS "observedAt"
         FROM flood_extents e
         LEFT JOIN admin_units a ON a.id = e.lga_id
        WHERE e.receded_at IS NULL AND e.observed_at > now() - ($1::int * interval '1 day')
        ORDER BY e.observed_at DESC, e.id
        LIMIT $2::int`,
      [days, limit],
    );
    return rows.map(({ lon, lat, observedAt, ...rest }) => ({ ...rest, point: [lon, lat], observedAt: observedAt.toISOString() }));
  }

  async findHistory(areaId: string, limit: number): Promise<FloodHistory> {
    // A flood is filed under the ward and LGA at its middle, so an LGA's history is its own id, and a ward's is
    // the ward's: the same query answers both. The totals count every flood; only the list is capped.
    type Row = Omit<FloodHistoryItem, "receded" | "recededAt" | "observedAt"> & { recededAt: Date | null; observedAt: Date };
    const [[totals], items]: [{ total: number; active: number; largestAreaM2: number; latestAt: Date | null }[], Row[]] = await Promise.all([
      this.repo.query(
        `SELECT count(*)::int AS total, (count(*) FILTER (WHERE receded_at IS NULL))::int AS active,
                COALESCE(max(area_m2), 0)::float8 AS "largestAreaM2", max(observed_at) AS "latestAt"
           FROM flood_extents WHERE lga_id = $1 OR ward_id = $1`,
        [areaId],
      ),
      this.repo.query(
        `SELECT e.id, e.area_m2 AS "areaM2", e.depth, e.method, e.observed_at AS "observedAt", e.receded_at AS "recededAt",
                w.unit_name AS "wardName",
                ST_X(ST_PointOnSurface(e.geom)) AS longitude, ST_Y(ST_PointOnSurface(e.geom)) AS latitude
           FROM flood_extents e
           LEFT JOIN admin_units w ON w.id = e.ward_id
          WHERE e.lga_id = $1 OR e.ward_id = $1
          ORDER BY e.observed_at DESC, e.id
          LIMIT $2::int`,
        [areaId, limit],
      ),
    ]);
    return {
      total: totals?.total ?? 0,
      active: totals?.active ?? 0,
      largestAreaM2: totals?.largestAreaM2 ?? 0,
      latestAt: totals?.latestAt?.toISOString() ?? null,
      items: items.map((row) => ({ ...row, receded: row.recededAt !== null, recededAt: row.recededAt?.toISOString() ?? null, observedAt: row.observedAt.toISOString() })),
    };
  }

  async impactOf(id: string): Promise<FloodImpact | null> {
    // What the flood reaches, counted against the layers already loaded. Each layer is narrowed by its
    // GiST index (&&) before the exact test. A layer that isn't loaded yet simply counts zero.
    const rows: { impact: FloodImpact }[] = await this.repo.query(
      `WITH e AS (SELECT geom, area_m2 FROM flood_extents WHERE id = $1)
       SELECT json_build_object(
         'areaM2', (SELECT area_m2 FROM e),
         'buildings', (SELECT count(*)::int FROM buildings b, e WHERE b.geom && e.geom AND ST_Intersects(b.geom, e.geom)),
         'roadMetres', (SELECT COALESCE(round(sum(ST_Length(ST_CollectionExtract(ST_Intersection(r.geom, e.geom), 2)::geography)))::int, 0)
                          FROM roads r, e WHERE r.geom && e.geom AND ST_Intersects(r.geom, e.geom)),
         'facilities', json_build_object(
           'total', (SELECT count(*)::int FROM infrastructure f, e WHERE f.geom && e.geom AND ST_Covers(e.geom, f.geom)),
           'items', (SELECT COALESCE(json_agg(row_to_json(q)), '[]'::json) FROM (
                       SELECT f.name, f.facility_type AS "facilityType", f.osm_class AS "osmClass"
                         FROM infrastructure f, e WHERE f.geom && e.geom AND ST_Covers(e.geom, f.geom)
                        ORDER BY array_position($2::text[], f.facility_type::text), f.name
                        LIMIT $3::int) q)),
         'settlements', (SELECT COALESCE(json_agg(q.settlement_name), '[]'::json) FROM (
                           SELECT s.settlement_name FROM settlement_points s, e
                            WHERE s.geom && e.geom AND ST_Covers(e.geom, s.geom)
                            ORDER BY s.settlement_name LIMIT $3::int) q),
         'wards', (SELECT COALESCE(json_agg(q.unit_name), '[]'::json) FROM (
                     SELECT a.unit_name FROM admin_units a, e
                      WHERE a.level = $4::smallint AND a.geom && e.geom AND ST_Intersects(a.geom, e.geom)
                      ORDER BY a.unit_name LIMIT $3::int) q),
         'drains', json_build_object(
           'total', (SELECT count(*)::int FROM drainage_features d, e
                      WHERE d.geom && ST_Expand(e.geom, 0.0025) AND ST_DWithin(d.geom::geography, e.geom::geography, $5::float8)),
           'needAttention', (SELECT count(*)::int FROM drainage_features d, e
                              WHERE d.condition IN ('blocked', 'overflowing', 'damaged')
                                AND d.geom && ST_Expand(e.geom, 0.0025) AND ST_DWithin(d.geom::geography, e.geom::geography, $5::float8)),
           'items', (SELECT COALESCE(json_agg(row_to_json(q)), '[]'::json) FROM (
                       SELECT d.id, d.name, d.kind, d.condition, round(ST_Distance(d.geom::geography, e.geom::geography))::int AS "distanceM"
                         FROM drainage_features d, e
                        WHERE d.geom && ST_Expand(e.geom, 0.0025) AND ST_DWithin(d.geom::geography, e.geom::geography, $5::float8)
                        ORDER BY (d.condition IN ('blocked', 'overflowing', 'damaged')) DESC,
                                 ST_Distance(d.geom::geography, e.geom::geography), d.id
                        LIMIT $3::int) q))
       ) AS impact
       WHERE EXISTS (SELECT 1 FROM e)`,
      [id, [...FACILITY_TYPES], SURVEY_LIMITS.impactListMax, DEFAULT_WARD_LEVEL, SURVEY_LIMITS.nearbyDrainMetres],
    );
    return rows[0]?.impact ?? null;
  }
}
