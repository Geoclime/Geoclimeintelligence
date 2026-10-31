import { BaseRepository } from "../../common/repository/base.repository";
import type { LayerGeoJsonQuery } from "../map-layers/map-layer.types";
import type { DrainageChanges, DrainageDto, DrainageFeatureCollection, IDrainageRepository, NewDrainage } from "./field-survey.types";
import { DrainageFeature } from "./drainage-feature.entity";
import { isLineKind, SURVEY_LIMITS } from "./survey-rules";

// Every spatial operation runs in PostGIS, never in JS (section 8).

/** Where a drain starts (a line) or is (a spot), to open it on the map. */
const START_POINT = `(CASE WHEN GeometryType(geom) = 'LINESTRING' THEN ST_StartPoint(geom) ELSE geom END)`;

const RETURNING = `
  id, kind, condition, name, width_m AS "widthM", depth_m AS "depthM", length_m AS "lengthM", note, method,
  ward_id AS "wardId", lga_id AS "lgaId", last_checked_at AS "lastCheckedAt",
  ST_X(${START_POINT}) AS longitude, ST_Y(${START_POINT}) AS latitude`;

type DrainageRow = Omit<DrainageDto, "lastCheckedAt"> & { lastCheckedAt: Date };

function toDto(row: DrainageRow): DrainageDto {
  return { ...row, lastCheckedAt: row.lastCheckedAt.toISOString() };
}

export class DrainageRepository extends BaseRepository<DrainageFeature> implements IDrainageRepository {
  private static _instance?: DrainageRepository;
  static get Instance(): DrainageRepository {
    return (this._instance ??= new DrainageRepository());
  }

  protected readonly entity = DrainageFeature;

  async create(input: NewDrainage): Promise<DrainageDto | null> {
    // A drain along the ground is a line through the walked points, measured on the spheroid; the rest
    // are one spot (the first point). A line outside what a drain can be stores nothing: the SELECT's
    // WHERE then returns no row. `shape` is built from fixed text, never from the request.
    const shape = isLineKind(input.kind) ? `SELECT ST_MakeLine(pt ORDER BY ord) AS g FROM src` : `SELECT pt AS g FROM src ORDER BY ord LIMIT 1`;
    const rows: DrainageRow[] = await this.repo.query(
      `WITH src AS (
         SELECT ST_SetSRID(ST_MakePoint((p->>0)::float8, (p->>1)::float8), 4326) AS pt, t.ord
           FROM json_array_elements($1::json) WITH ORDINALITY AS t(p, ord)
       ), shape AS (${shape})
       INSERT INTO drainage_features (country_code, ward_id, lga_id, kind, condition, name, geom, width_m, depth_m,
                                      length_m, note, method, recorded_by)
       SELECT $2::char(3), $3::uuid, $4::uuid, $5::varchar, $6::varchar, $7::varchar, s.g, $8::float8, $9::float8,
              CASE WHEN GeometryType(s.g) = 'LINESTRING' THEN ST_Length(s.g::geography) END, $10::varchar, $11::varchar, $12::uuid
         FROM shape s
        WHERE GeometryType(s.g) = 'POINT' OR ST_Length(s.g::geography) BETWEEN $13::float8 AND $14::float8
       RETURNING ${RETURNING}`,
      [
        JSON.stringify(input.points), input.countryCode, input.wardId, input.lgaId, input.kind, input.condition, input.name,
        input.widthM, input.depthM, input.note, input.method, input.recordedBy,
        SURVEY_LIMITS.drainLengthM.min, SURVEY_LIMITS.drainLengthM.max,
      ],
    );
    return rows[0] ? toDto(rows[0]) : null;
  }

  async update(id: string, changes: DrainageChanges): Promise<DrainageDto | null> {
    // Saving a change is an inspection: it moves last_checked_at, even if only the condition changed.
    const rows: DrainageRow[] = await this.repo.query(
      `UPDATE drainage_features
          SET condition = $2::varchar, name = $3::varchar, width_m = $4::float8, depth_m = $5::float8, note = $6::varchar,
              last_checked_at = now(), updated_at = now()
        WHERE id = $1
        RETURNING ${RETURNING}`,
      [id, changes.condition, changes.name, changes.widthM, changes.depthM, changes.note],
    );
    return rows[0] ? toDto(rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const rows: unknown[] = await this.repo.query(`DELETE FROM drainage_features WHERE id = $1 RETURNING 1`, [id]);
    return rows.length > 0;
  }

  async findGeoJson(query: LayerGeoJsonQuery): Promise<DrainageFeatureCollection> {
    const [minLon, minLat, maxLon, maxLat] = query.bbox;
    const limit = SURVEY_LIMITS.featureCap;
    // Drains that need attention come first, so a cap, if it bites, drops the ones that are fine.
    const rows: { fc: DrainageFeatureCollection }[] = await this.repo.query(
      `WITH view AS (SELECT ST_MakeEnvelope($1, $2, $3, $4, 4326) AS box),
            picked AS (
              SELECT d.id, d.geom, d.kind, d.condition, d.name, d.width_m, d.depth_m, d.length_m, d.note, d.last_checked_at,
                     row_number() OVER (ORDER BY (d.condition IN ('blocked', 'overflowing', 'damaged')) DESC, d.id) AS n
                FROM drainage_features d, view
               WHERE d.geom && view.box AND ST_Intersects(d.geom, view.box)
               ORDER BY (d.condition IN ('blocked', 'overflowing', 'damaged')) DESC, d.id
               LIMIT $5::int + 1)
       SELECT json_build_object(
         'type', 'FeatureCollection',
         'truncated', COALESCE(max(n) > $5::int, false),
         'features', COALESCE(json_agg(json_build_object(
           'type', 'Feature',
           'id', id,
           'geometry', ST_AsGeoJSON(geom, 6)::json,
           'properties', json_build_object('id', id, 'kind', kind, 'condition', condition, 'name', name, 'widthM', width_m,
                                           'depthM', depth_m, 'lengthM', length_m, 'note', note, 'lastCheckedAt', last_checked_at)
         ) ORDER BY n) FILTER (WHERE n <= $5::int), '[]'::json)
       ) AS fc
       FROM picked`,
      [minLon, minLat, maxLon, maxLat, limit],
    );
    return rows[0]?.fc ?? { type: "FeatureCollection", features: [], truncated: false };
  }
}
