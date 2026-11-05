import { BaseRepository } from "../../common/repository/base.repository";
import type { LayerGeoJsonQuery } from "../map-layers/map-layer.types";
import type {
  DrainageChanges,
  DrainageDto,
  DrainageFeatureCollection,
  DrainageSummary,
  DrainageSummaryItem,
  DrainInspectionDto,
  DrainPeople,
  IDrainageRepository,
  ImportedDrain,
  InspectionContext,
  NewDrainage,
} from "./field-survey.types";
import { DrainageFeature } from "./drainage-feature.entity";
import { isLineKind, SURVEY_LIMITS } from "./survey-rules";

// Every spatial operation runs in PostGIS, never in JS (section 8).

/** Where a drain starts (a line) or is (a spot), to open it on the map. */
const START_POINT = `(CASE WHEN GeometryType(geom) = 'LINESTRING' THEN ST_StartPoint(geom) ELSE geom END)`;

// An UPDATE or DELETE run through TypeORM's query() comes back as [rows, rowCount], not as the rows, so
// each one is wrapped in a CTE and read back with a SELECT, as the other repositories do (INSERT is fine).
const RETURNING = `
  id, kind, condition, name, width_m AS "widthM", depth_m AS "depthM", length_m AS "lengthM", note, method,
  flow_direction AS "flowDirection", diameter_m AS "diameterM", material, barrels,
  ward_id AS "wardId", lga_id AS "lgaId", last_checked_at AS "lastCheckedAt",
  ST_X(${START_POINT}) AS longitude, ST_Y(${START_POINT}) AS latitude`;

/** Photos on a drain, its own and its inspections' (map_photos, migration CreateMapPhotos). */
const PHOTO_COUNT = (alias: string) => `(SELECT count(*)::int FROM map_photos mp
   WHERE mp.drain_id = ${alias}.id OR mp.inspection_id IN (SELECT i.id FROM drain_inspections i WHERE i.drain_id = ${alias}.id))`;

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
                                      length_m, note, method, recorded_by, last_checked_by,
                                      flow_direction, diameter_m, material, barrels)
       SELECT $2::char(3), $3::uuid, $4::uuid, $5::varchar, $6::varchar, $7::varchar, s.g, $8::float8, $9::float8,
              CASE WHEN GeometryType(s.g) = 'LINESTRING' THEN ST_Length(s.g::geography) END, $10::varchar, $11::varchar, $12::uuid, $12::uuid,
              CASE WHEN GeometryType(s.g) = 'LINESTRING' THEN $15::varchar END, $16::float8, $17::varchar, $18::smallint
         FROM shape s
        WHERE GeometryType(s.g) = 'POINT' OR ST_Length(s.g::geography) BETWEEN $13::float8 AND $14::float8
       RETURNING ${RETURNING}`,
      [
        JSON.stringify(input.points), input.countryCode, input.wardId, input.lgaId, input.kind, input.condition, input.name,
        input.widthM, input.depthM, input.note, input.method, input.recordedBy,
        SURVEY_LIMITS.drainLengthM.min, SURVEY_LIMITS.drainLengthM.max,
        input.flowDirection, input.diameterM, input.material, input.barrels,
      ],
    );
    return rows[0] ? toDto(rows[0]) : null;
  }

  async inspect(id: string, changes: DrainageChanges, inspection: InspectionContext): Promise<{ drain: DrainageDto; inspectionId: string; distanceM: number | null } | null> {
    // One statement: the drain's new state, and the record of who checked it, what they found and where they
    // stood. If either can't be written, neither is. The distance is measured on the spheroid from where the
    // phone was to the nearest point of the drain. `flow_direction` only sticks on a line (a CHECK says so).
    type Row = DrainageRow & { inspectionId: string; distanceM: number | null };
    const rows: Row[] = await this.repo.query(
      `WITH changed AS (
         UPDATE drainage_features
            SET condition = $2::varchar, name = $3::varchar, width_m = $4::float8, depth_m = $5::float8, note = $6::varchar,
                flow_direction = CASE WHEN GeometryType(geom) = 'LINESTRING' THEN $7::varchar END,
                diameter_m = $8::float8, material = $9::varchar, barrels = $10::smallint,
                last_checked_at = now(), last_checked_by = $11::uuid, updated_at = now()
          WHERE id = $1
          RETURNING *),
       spot AS (
         SELECT CASE WHEN $15::float8 IS NULL OR $16::float8 IS NULL THEN NULL
                     ELSE ST_SetSRID(ST_MakePoint($15::float8, $16::float8), 4326) END AS pt),
       logged AS (
         INSERT INTO drain_inspections (drain_id, inspected_by, inspector_name, inspector_role, condition_before, condition_after,
                                        note, inspector_point, inspector_accuracy_m, distance_m)
         SELECT c.id, $11::uuid, $12::varchar, $13::varchar, $14::varchar, c.condition, $17::varchar, s.pt, $18::float8,
                CASE WHEN s.pt IS NULL THEN NULL ELSE ST_Distance(s.pt::geography, c.geom::geography) END
           FROM changed c, spot s
         RETURNING id AS logged_id, distance_m AS logged_distance)
       SELECT ${RETURNING}, logged.logged_id AS "inspectionId", logged.logged_distance AS "distanceM"
         FROM changed, logged`,
      [
        id, changes.condition, changes.name, changes.widthM, changes.depthM, changes.note,
        changes.flowDirection, changes.diameterM, changes.material, changes.barrels,
        inspection.inspectedBy, inspection.inspectorName, inspection.inspectorRole, inspection.conditionBefore,
        inspection.point?.[0] ?? null, inspection.point?.[1] ?? null, inspection.note, inspection.accuracyM,
      ],
    );
    const row = rows[0];
    if (!row) return null;
    const { inspectionId, distanceM, ...drain } = row;
    return { drain: toDto(drain), inspectionId, distanceM };
  }

  async findInspections(id: string, limit: number): Promise<DrainInspectionDto[]> {
    type Row = Omit<DrainInspectionDto, "inspectedAt"> & { inspectedAt: Date };
    const rows: Row[] = await this.repo.query(
      `SELECT i.id, i.inspected_at AS "inspectedAt", i.inspected_by AS "inspectedBy",
              COALESCE(u.display_name, i.inspector_name) AS "inspectorName", i.inspector_role AS "inspectorRole",
              i.condition_before AS "conditionBefore", i.condition_after AS "conditionAfter", i.note,
              i.distance_m AS "distanceM", i.inspector_accuracy_m AS "accuracyM",
              (SELECT count(*)::int FROM map_photos mp WHERE mp.inspection_id = i.id) AS "photoCount"
         FROM drain_inspections i
         LEFT JOIN users u ON u.id = i.inspected_by
        WHERE i.drain_id = $1
        ORDER BY i.inspected_at DESC, i.id DESC
        LIMIT $2::int`,
      [id, limit],
    );
    return rows.map((row) => ({ ...row, inspectedAt: row.inspectedAt.toISOString() }));
  }

  async findPeople(id: string): Promise<DrainPeople | null> {
    const rows: { recordedId: string | null; recordedName: string | null; recordedRole: string | null; checkedId: string | null; checkedName: string | null; checkedRole: string | null; lastCheckedAt: Date }[] =
      await this.repo.query(
        `SELECT d.recorded_by AS "recordedId", r.display_name AS "recordedName", r.role AS "recordedRole",
                d.last_checked_by AS "checkedId", c.display_name AS "checkedName", c.role AS "checkedRole",
                d.last_checked_at AS "lastCheckedAt"
           FROM drainage_features d
           LEFT JOIN users r ON r.id = d.recorded_by
           LEFT JOIN users c ON c.id = d.last_checked_by
          WHERE d.id = $1`,
        [id],
      );
    const row = rows[0];
    if (!row) return null;
    return {
      recordedBy: row.recordedId ? { id: row.recordedId, name: row.recordedName, role: row.recordedRole } : null,
      lastCheckedBy: row.checkedId ? { id: row.checkedId, name: row.checkedName, role: row.checkedRole } : null,
      lastCheckedAt: row.lastCheckedAt.toISOString(),
    };
  }

  async importMany(
    drains: ImportedDrain[],
    context: { countryCode: string; recordedBy: string; wardLevel: number },
  ): Promise<{ inserted: number; alreadyPresent: number; rejected: Record<string, number> }> {
    if (drains.length === 0) return { inserted: 0, alreadyPresent: 0, rejected: {} };
    // Each drain is built and checked in PostGIS like one recorded by hand: a line through its points (its
    // length measured), or a spot. It is filed under the ward and LGA at its start, and must be inside the
    // country's mapped areas. A plan's own id (source_ref) already stored means it is left alone.
    const payload = drains.map((d) => ({
      ref: d.sourceRef, kind: d.kind, condition: d.condition, name: d.name, width_m: d.widthM, depth_m: d.depthM,
      diameter_m: d.diameterM, material: d.material, barrels: d.barrels, flow: d.flowDirection, note: d.note,
      line: isLineKind(d.kind), points: d.points, checked_at: d.checkedAt,
    }));
    const [row]: { received: number; inserted: number; existing: number; outside: number; badLength: number }[] = await this.repo.query(
      `WITH src AS (
         SELECT * FROM json_to_recordset($1::json) AS r(
           ref text, kind text, condition text, name text, width_m float8, depth_m float8, diameter_m float8,
           material text, barrels int, flow text, note text, line boolean, points json, checked_at date)
       ),
       shaped AS (
         SELECT s.*,
                CASE WHEN s.line THEN
                  (SELECT ST_MakeLine(ST_SetSRID(ST_MakePoint((p->>0)::float8, (p->>1)::float8), 4326) ORDER BY ord)
                     FROM json_array_elements(s.points) WITH ORDINALITY AS t(p, ord))
                ELSE
                  ST_SetSRID(ST_MakePoint((s.points->0->>0)::float8, (s.points->0->>1)::float8), 4326)
                END AS g
           FROM src s
       ),
       started AS (
         SELECT sh.*,
                CASE WHEN GeometryType(sh.g) = 'LINESTRING' THEN ST_StartPoint(sh.g) ELSE sh.g END AS start_pt,
                CASE WHEN GeometryType(sh.g) = 'LINESTRING' THEN ST_Length(sh.g::geography) END AS len
           FROM shaped sh
       ),
       placed AS (
         SELECT st.*,
                (SELECT a.id FROM admin_units a
                  WHERE a.country_code = $2::char(3) AND a.level = $4::smallint
                    AND a.geom && st.start_pt AND ST_Covers(a.geom, st.start_pt)
                  ORDER BY a.id LIMIT 1) AS ward_id
           FROM started st
       ),
       ready AS (
         SELECT p.*, (SELECT w.parent_id FROM admin_units w WHERE w.id = p.ward_id) AS lga_id
           FROM placed p
          WHERE p.ward_id IS NOT NULL
            AND (p.len IS NULL OR p.len BETWEEN $5::float8 AND $6::float8)
       ),
       ins AS (
         INSERT INTO drainage_features (country_code, ward_id, lga_id, kind, condition, name, geom, width_m, depth_m, length_m,
                                        note, method, recorded_by, last_checked_by, last_checked_at, flow_direction, diameter_m, material, barrels, source_ref)
         SELECT $2::char(3), r.ward_id, r.lga_id, r.kind, r.condition, r.name, r.g, r.width_m, r.depth_m, r.len,
                r.note, 'import', $3::uuid, NULL, r.checked_at::timestamptz, CASE WHEN r.line THEN r.flow END, r.diameter_m, r.material, r.barrels, r.ref
           FROM ready r
         ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
         RETURNING 1
       )
       SELECT (SELECT count(*) FROM src)::int AS received,
              (SELECT count(*) FROM ins)::int AS inserted,
              ((SELECT count(*) FROM ready) - (SELECT count(*) FROM ins))::int AS existing,
              (SELECT count(*) FROM placed WHERE ward_id IS NULL)::int AS outside,
              (SELECT count(*) FROM placed WHERE ward_id IS NOT NULL AND len IS NOT NULL AND len NOT BETWEEN $5::float8 AND $6::float8)::int AS "badLength"`,
      [JSON.stringify(payload), context.countryCode, context.recordedBy, context.wardLevel, SURVEY_LIMITS.drainLengthM.min, SURVEY_LIMITS.drainLengthM.max],
    );
    const rejected: Record<string, number> = {};
    if (row?.outside) rejected["starts outside every mapped ward"] = row.outside;
    if (row?.badLength) rejected[`shorter than ${SURVEY_LIMITS.drainLengthM.min} m or longer than ${SURVEY_LIMITS.drainLengthM.max / 1000} km`] = row.badLength;
    return { inserted: row?.inserted ?? 0, alreadyPresent: row?.existing ?? 0, rejected };
  }

  async findSummary(areaId: string, limit: number): Promise<DrainageSummary> {
    // A drain is filed under the ward and LGA where it starts, so an LGA's drainage is a lookup by its own id, and a
    // ward's by the ward's. Totals count all of it; only the list is capped. The worst come first (water is not getting
    // through), then the partly blocked, then the clear; within each, the one looked at longest ago first.
    type Row = Omit<DrainageSummaryItem, "lastCheckedAt"> & { lastCheckedAt: Date };
    const [[totals], items]: [{ total: number; needAttention: number; partlyBlocked: number; clear: number; lastCheckedAt: Date | null }[], Row[]] = await Promise.all([
      this.repo.query(
        `SELECT count(*)::int AS total,
                (count(*) FILTER (WHERE condition IN ('blocked', 'overflowing', 'damaged')))::int AS "needAttention",
                (count(*) FILTER (WHERE condition = 'partly_blocked'))::int AS "partlyBlocked",
                (count(*) FILTER (WHERE condition = 'clear'))::int AS clear,
                max(last_checked_at) AS "lastCheckedAt"
           FROM drainage_features WHERE lga_id = $1 OR ward_id = $1`,
        [areaId],
      ),
      this.repo.query(
        `SELECT d.id, d.kind, d.condition, d.name, d.width_m AS "widthM", d.depth_m AS "depthM", d.length_m AS "lengthM",
                d.last_checked_at AS "lastCheckedAt", w.unit_name AS "wardName",
                ST_X(CASE WHEN GeometryType(d.geom) = 'LINESTRING' THEN ST_StartPoint(d.geom) ELSE d.geom END) AS longitude,
                ST_Y(CASE WHEN GeometryType(d.geom) = 'LINESTRING' THEN ST_StartPoint(d.geom) ELSE d.geom END) AS latitude
           FROM drainage_features d
           LEFT JOIN admin_units w ON w.id = d.ward_id
          WHERE d.lga_id = $1 OR d.ward_id = $1
          ORDER BY CASE WHEN d.condition IN ('blocked', 'overflowing', 'damaged') THEN 0 WHEN d.condition = 'partly_blocked' THEN 1 ELSE 2 END,
                   d.last_checked_at, d.id
          LIMIT $2::int`,
        [areaId, limit],
      ),
    ]);
    return {
      total: totals?.total ?? 0,
      needAttention: totals?.needAttention ?? 0,
      partlyBlocked: totals?.partlyBlocked ?? 0,
      clear: totals?.clear ?? 0,
      lastCheckedAt: totals?.lastCheckedAt?.toISOString() ?? null,
      items: items.map((row) => ({ ...row, lastCheckedAt: row.lastCheckedAt.toISOString() })),
    };
  }

  async delete(id: string): Promise<boolean> {
    const [row]: { n: number }[] = await this.repo.query(`WITH gone AS (DELETE FROM drainage_features WHERE id = $1 RETURNING 1) SELECT count(*)::int AS n FROM gone`, [id]);
    return (row?.n ?? 0) > 0;
  }

  async findGeoJson(query: LayerGeoJsonQuery): Promise<DrainageFeatureCollection> {
    const [minLon, minLat, maxLon, maxLat] = query.bbox;
    const limit = SURVEY_LIMITS.featureCap;
    // Drains that need attention come first, so a cap, if it bites, drops the ones that are fine.
    const rows: { fc: DrainageFeatureCollection }[] = await this.repo.query(
      `WITH view AS (SELECT ST_MakeEnvelope($1, $2, $3, $4, 4326) AS box),
            picked AS (
              SELECT d.id, d.geom, d.kind, d.condition, d.name, d.width_m, d.depth_m, d.length_m, d.note, d.last_checked_at, d.lga_id, d.ward_id,
                     d.method, d.flow_direction, d.diameter_m, d.material, d.barrels, ${PHOTO_COUNT("d")} AS photo_count,
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
                                           'depthM', depth_m, 'lengthM', length_m, 'note', note, 'lastCheckedAt', last_checked_at,
                                           'method', method, 'flowDirection', flow_direction, 'diameterM', diameter_m,
                                           'material', material, 'barrels', barrels, 'photoCount', photo_count,
                                           'lgaId', lga_id, 'wardId', ward_id)
         ) ORDER BY n) FILTER (WHERE n <= $5::int), '[]'::json)
       ) AS fc
       FROM picked`,
      [minLon, minLat, maxLon, maxLat, limit],
    );
    return rows[0]?.fc ?? { type: "FeatureCollection", features: [], truncated: false };
  }
}
