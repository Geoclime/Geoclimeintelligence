import type { EntityManager } from "typeorm";
import { AppDataSource } from "../../config/data-source";
import type {
  BatchContext,
  BatchResult,
  EnsuredSource,
  ILayerLoadStore,
  InfrastructureRow,
  LayerLoadTx,
  NewLayerSource,
  RejectCounts,
  RoadRow,
  WardBatchContext,
  SettlementRow,
  WaterwayRow,
} from "./map-layer-loader.types";

/**
 * Every write the layers:load and layers:clear scripts make. Spatial checks run here in PostGIS (section 8), the
 * same rules as the import pipeline's: readable shape, the right type, EPSG:4326, real
 * coordinates, repaired if invalid, inside the country's rough box. Rows are never updated once
 * stored, except that a settlement or facility saved without a ward is linked when its ward later exists.
 * layers:clear deletes a country's roads, waterways or infrastructure, so they can be reloaded or the country deleted.
 */

/** Why PostGIS refuses a shape, as the keys of the check query and the words shown to the user. */
const REJECT_REASONS = {
  unreadable: "the shape could not be read as GeoJSON",
  wrong_type: "the shape is the wrong type for this layer",
  empty: "the shape is empty (or empty once repaired)",
  bad_coordinates: "the coordinates are outside longitude -180..180 / latitude -90..90",
  outside_country_box: "the shape lies outside the country's bounding box",
} as const;
type RejectKey = keyof typeof REJECT_REASONS;
const REJECT_KEYS = Object.keys(REJECT_REASONS) as RejectKey[];

/**
 * The shared front of every insert: parse each row's GeoJSON, repair an invalid shape, and give
 * each row a `reject` reason (or NULL when it passes). $1 = the rows as JSON, $2 = the country's
 * box (float8[4] or NULL). `allowedTypes` are PostGIS GeometryType names written by this file,
 * never by a user.
 */
function checkedRowsSql(recordColumns: string, allowedTypes: readonly string[]): string {
  const types = allowedTypes.map((type) => `'${type}'`).join(", ");
  return `
    WITH incoming AS (
      SELECT r.*, ST_SetSRID(import_parse_geometry(r.shape, 'geojson'), 4326) AS g0
        FROM json_to_recordset($1::json) AS r(${recordColumns})
    ), repaired AS (
      SELECT i.*,
             CASE WHEN i.g0 IS NULL THEN NULL
                  WHEN ST_IsValid(i.g0) THEN i.g0
                  ELSE ST_CollectionExtract(ST_MakeValid(i.g0),
                         CASE WHEN GeometryType(i.g0) LIKE '%POLYGON' THEN 3 WHEN GeometryType(i.g0) LIKE '%LINESTRING' THEN 2 ELSE 1 END)
             END AS g
        FROM incoming i
    ), checked AS (
      SELECT p.*,
             CASE WHEN p.g0 IS NULL THEN 'unreadable'
                  WHEN GeometryType(p.g0) NOT IN (${types}) THEN 'wrong_type'
                  WHEN p.g IS NULL OR ST_IsEmpty(p.g) THEN 'empty'
                  WHEN ST_XMin(p.g) < -180 OR ST_XMax(p.g) > 180 OR ST_YMin(p.g) < -90 OR ST_YMax(p.g) > 90 THEN 'bad_coordinates'
                  WHEN $2::float8[] IS NOT NULL AND NOT ST_Within(p.g,
                         ST_MakeEnvelope(($2::float8[])[1], ($2::float8[])[2], ($2::float8[])[3], ($2::float8[])[4], 4326))
                    THEN 'outside_country_box'
             END AS reject
        FROM repaired p
    )`;
}

/** The counts every insert reports: rows received, and how many failed each shape check. */
const REJECT_COLUMNS = REJECT_KEYS.map((key) => `count(*) FILTER (WHERE reject = '${key}')::int AS "${key}"`).join(",\n         ");

type CountRow = { received: number; inserted: number; relinked?: number; unlinked?: number } & Record<RejectKey, number>;

function toResult(row: CountRow | undefined, receivedFallback: number): BatchResult {
  const rejected: RejectCounts = {};
  for (const key of REJECT_KEYS) {
    const count = row?.[key] ?? 0;
    if (count > 0) rejected[REJECT_REASONS[key]] = count;
  }
  const received = row?.received ?? receivedFallback;
  const inserted = row?.inserted ?? 0;
  const relinked = row?.relinked ?? 0;
  const refused = Object.values(rejected).reduce((sum, count) => sum + count, 0);
  return {
    received,
    inserted,
    alreadyPresent: Math.max(received - refused - inserted - relinked, 0),
    relinked,
    unlinked: row?.unlinked ?? 0,
    rejected,
  };
}

const box = (context: BatchContext) => context.bbox ?? null;

class PostgresLayerLoadTx implements LayerLoadTx {
  constructor(private readonly manager: EntityManager) {}

  async ensureSource(input: NewLayerSource): Promise<EnsuredSource> {
    const params = [input.provider, input.datasetName, input.url, input.license, input.downloadedOn];
    const [found]: { id: string }[] = await this.manager.query(
      `SELECT id FROM data_sources
        WHERE provider = $1 AND dataset_name = $2 AND url = $3 AND license = $4 AND downloaded_on = $5::date
        LIMIT 1`,
      params,
    );
    if (found) return { id: found.id, created: false };
    const [created]: { id: string }[] = await this.manager.query(
      `INSERT INTO data_sources (provider, dataset_name, url, license, downloaded_on, notes)
       VALUES ($1, $2, $3, $4, $5::date, $6) RETURNING id`,
      [...params, input.notes],
    );
    return { id: created!.id, created: true };
  }

  async sourceExists(id: string): Promise<boolean> {
    const rows: unknown[] = await this.manager.query(`SELECT 1 FROM data_sources WHERE id = $1`, [id]);
    return rows.length > 0;
  }

  async insertRoads(rows: RoadRow[], context: BatchContext): Promise<BatchResult> {
    const payload = rows.map((row) => ({
      osm_id: row.osmId, name: row.name, road_class: row.roadClass, class_rank: row.classRank,
      surface: row.surface, smoothness: row.smoothness, width: row.width, lanes: row.lanes,
      oneway: row.oneway, is_bridge: row.isBridge, shape: row.shape,
    }));
    const result: CountRow[] = await this.manager.query(
      `${checkedRowsSql(
        `osm_id text, name text, road_class text, class_rank smallint, surface text, smoothness text,
         width text, lanes text, oneway text, is_bridge boolean, shape text`,
        ["LINESTRING", "MULTILINESTRING"],
      )},
       ins AS (
         INSERT INTO roads (country_code, osm_id, name, road_class, class_rank, surface, smoothness,
                            width, lanes, oneway, is_bridge, geom, source_id)
         SELECT $3::char(3), c.osm_id, c.name, c.road_class, c.class_rank, c.surface, c.smoothness,
                c.width, c.lanes, c.oneway, c.is_bridge, ST_Multi(ST_Force2D(c.g)), $4::uuid
           FROM checked c WHERE c.reject IS NULL
         ON CONFLICT (osm_id) DO NOTHING
         RETURNING 1
       )
       SELECT count(*)::int AS received, (SELECT count(*) FROM ins)::int AS inserted,
              ${REJECT_COLUMNS}
         FROM checked`,
      [JSON.stringify(payload), box(context), context.countryCode, context.sourceId],
    );
    return toResult(result[0], rows.length);
  }

  async insertWaterways(rows: WaterwayRow[], context: BatchContext): Promise<BatchResult> {
    const payload = rows.map((row) => ({
      osm_id: row.osmId, name: row.name, waterway_type: row.waterwayType, water_tag: row.waterTag,
      water_class: row.waterClass, class_basis: row.classBasis, tunnel: row.tunnel, covered: row.covered,
      width: row.width, shape: row.shape,
    }));
    const result: CountRow[] = await this.manager.query(
      `${checkedRowsSql(
        `osm_id text, name text, waterway_type text, water_tag text, water_class text, class_basis text,
         tunnel text, covered text, width text, shape text`,
        ["LINESTRING", "MULTILINESTRING", "POLYGON", "MULTIPOLYGON"],
      )},
       ins AS (
         INSERT INTO waterways (country_code, osm_id, name, waterway_type, water_tag, water_class,
                                class_basis, tunnel, covered, width, geom, source_id)
         SELECT $3::char(3), c.osm_id, c.name, c.waterway_type, c.water_tag, c.water_class,
                c.class_basis, c.tunnel, c.covered, c.width, ST_Multi(ST_Force2D(c.g)), $4::uuid
           FROM checked c WHERE c.reject IS NULL
         ON CONFLICT (osm_id) DO NOTHING
         RETURNING 1
       )
       SELECT count(*)::int AS received, (SELECT count(*) FROM ins)::int AS inserted,
              ${REJECT_COLUMNS}
         FROM checked`,
      [JSON.stringify(payload), box(context), context.countryCode, context.sourceId],
    );
    return toResult(result[0], rows.length);
  }

  async insertSettlements(rows: SettlementRow[], context: WardBatchContext): Promise<BatchResult> {
    const payload = rows.map((row) => ({
      set_id: row.setId, ward_code: row.wardCode, name: row.name, is_primary: row.isPrimary,
      data_origin: row.dataOrigin, shape: row.shape,
    }));
    // The ward is found by the file's ward code among the country's live wards. A code that
    // matches none still stores the point (unlinked); the next run links it once the ward exists.
    // xmax = 0 is how Postgres tells a fresh insert from an upsert that updated a row.
    const result: CountRow[] = await this.manager.query(
      `${checkedRowsSql(
        `set_id text, ward_code text, name text, is_primary boolean, data_origin text, shape text`,
        ["POINT"],
      )},
       ins AS (
         INSERT INTO settlement_points (admin_unit_id, source_settlement_code, source_ward_code, settlement_name,
                                        is_primary, data_origin, geom, source_id)
         SELECT w.id, c.set_id, c.ward_code, c.name, c.is_primary, c.data_origin, ST_Force2D(c.g), $3::uuid
           FROM checked c
           LEFT JOIN LATERAL (
             SELECT a.id FROM admin_units a
              WHERE a.country_code = $4::char(3) AND a.level = $5::smallint AND a.unit_code = c.ward_code
              ORDER BY a.id LIMIT 1) w ON true
          WHERE c.reject IS NULL
         ON CONFLICT (source_settlement_code) DO UPDATE
            SET admin_unit_id = EXCLUDED.admin_unit_id, updated_at = now()
          WHERE settlement_points.admin_unit_id IS NULL AND EXCLUDED.admin_unit_id IS NOT NULL
         RETURNING (xmax = 0) AS was_inserted, (admin_unit_id IS NULL) AS no_ward
       )
       SELECT count(*)::int AS received,
              (SELECT count(*) FILTER (WHERE was_inserted) FROM ins)::int AS inserted,
              (SELECT count(*) FILTER (WHERE NOT was_inserted) FROM ins)::int AS relinked,
              (SELECT count(*) FILTER (WHERE no_ward) FROM ins)::int AS unlinked,
              ${REJECT_COLUMNS}
         FROM checked`,
      [JSON.stringify(payload), box(context), context.sourceId, context.countryCode, context.wardLevel],
    );
    return toResult(result[0], rows.length);
  }

  async insertInfrastructure(rows: InfrastructureRow[], context: WardBatchContext): Promise<BatchResult> {
    const payload = rows.map((row) => ({
      osm_id: row.osmId, from_area: row.fromArea, name: row.name, facility_type: row.facilityType,
      osm_class: row.osmClass, shape: row.shape,
    }));
    // An outline becomes a point inside it (ST_PointOnSurface, which unlike a centroid never falls
    // outside an L-shaped site). The ward is the one at the ward level that covers that point; a
    // point in no live ward is still stored (unlinked), and the next run links it, as for settlements.
    const result: CountRow[] = await this.manager.query(
      `${checkedRowsSql(
        `osm_id text, from_area boolean, name text, facility_type text, osm_class text, shape text`,
        ["POINT", "POLYGON", "MULTIPOLYGON"],
      )},
       located AS (
         SELECT c.*, ST_Force2D(CASE WHEN GeometryType(c.g) LIKE '%POLYGON' THEN ST_PointOnSurface(c.g) ELSE c.g END) AS pt
           FROM checked c WHERE c.reject IS NULL
       ),
       ins AS (
         INSERT INTO infrastructure (country_code, admin_unit_id, osm_id, from_area, name, facility_type,
                                     osm_class, geom, source_id)
         SELECT $3::char(3), w.id, l.osm_id, l.from_area, l.name, l.facility_type, l.osm_class, l.pt, $4::uuid
           FROM located l
           LEFT JOIN LATERAL (
             SELECT a.id FROM admin_units a
              WHERE a.country_code = $3::char(3) AND a.level = $5::smallint
                AND a.geom && l.pt AND ST_Covers(a.geom, l.pt)
              ORDER BY a.id LIMIT 1) w ON true
         ON CONFLICT (osm_id, from_area) DO UPDATE
            SET admin_unit_id = EXCLUDED.admin_unit_id, updated_at = now()
          WHERE infrastructure.admin_unit_id IS NULL AND EXCLUDED.admin_unit_id IS NOT NULL
         RETURNING (xmax = 0) AS was_inserted, (admin_unit_id IS NULL) AS no_ward
       )
       SELECT count(*)::int AS received,
              (SELECT count(*) FILTER (WHERE was_inserted) FROM ins)::int AS inserted,
              (SELECT count(*) FILTER (WHERE NOT was_inserted) FROM ins)::int AS relinked,
              (SELECT count(*) FILTER (WHERE no_ward) FROM ins)::int AS unlinked,
              ${REJECT_COLUMNS}
         FROM checked`,
      [JSON.stringify(payload), box(context), context.countryCode, context.sourceId, context.wardLevel],
    );
    return toResult(result[0], rows.length);
  }

  async deleteRoads(countryCode: string): Promise<number> {
    const rows: unknown[] = await this.manager.query(`DELETE FROM roads WHERE country_code = $1 RETURNING 1`, [countryCode]);
    return rows.length;
  }

  async deleteWaterways(countryCode: string): Promise<number> {
    const rows: unknown[] = await this.manager.query(`DELETE FROM waterways WHERE country_code = $1 RETURNING 1`, [countryCode]);
    return rows.length;
  }

  async deleteSettlements(): Promise<number> {
    const rows: unknown[] = await this.manager.query(`DELETE FROM settlement_points RETURNING 1`);
    return rows.length;
  }

  async deleteInfrastructure(countryCode: string): Promise<number> {
    const rows: unknown[] = await this.manager.query(`DELETE FROM infrastructure WHERE country_code = $1 RETURNING 1`, [countryCode]);
    return rows.length;
  }
}

/**
 * Runs the loader's writes in one transaction. Not a BaseRepository: it owns no single table
 * (it writes five), so it opens the transaction itself, like the other repositories that need one.
 */
export class MapLayerLoadRepository implements ILayerLoadStore {
  private static _instance?: MapLayerLoadRepository;
  static get Instance(): MapLayerLoadRepository {
    return (this._instance ??= new MapLayerLoadRepository());
  }

  inTransaction<T>(work: (tx: LayerLoadTx) => Promise<T>): Promise<T> {
    return AppDataSource.transaction((manager) => work(new PostgresLayerLoadTx(manager)));
  }
}
