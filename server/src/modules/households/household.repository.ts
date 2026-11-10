import { AppDataSource } from "../../config/data-source";
import type { HouseholdChanges, HouseholdDto, HouseholdFeatureCollection, HouseholdRecord, IHouseholdRepository, NewHousehold } from "./household.types";

/** The most households one map reply holds (staff zoomed out over a town). */
export const HOUSEHOLD_FEATURE_CAP = 5_000;

type Row = Omit<HouseholdDto, "createdAt"> & { createdAt: Date };

/**
 * Households. Every query takes the viewer, so `mine` is answered in SQL and a household is never
 * returned to someone who may not see it: the owner's name is only selected for the staff query.
 */
const SELECT = (viewerParam: string, withOwner: boolean) => `
  SELECT h.id, h.label, h.note, h.people, h.home_type AS "homeType", h.phone,
         (SELECT count(*)::int FROM household_photos hp WHERE hp.household_id = h.id) AS "photoCount",
         h.lga_id AS "lgaId", h.ward_id AS "wardId",
         ST_X(h.geom) AS longitude, ST_Y(h.geom) AS latitude,
         (h.owner_id = ${viewerParam}::uuid) AS mine,
         ${withOwner ? `u.display_name` : `NULL::varchar`} AS "ownerName",
         h.created_at AS "createdAt"
    FROM households h
    ${withOwner ? `LEFT JOIN users u ON u.id = h.owner_id` : ""}`;

const toDto = (row: Row): HouseholdDto => ({ ...row, createdAt: row.createdAt.toISOString() });

export class HouseholdRepository implements IHouseholdRepository {
  private static _instance?: HouseholdRepository;
  static get Instance(): HouseholdRepository {
    return (this._instance ??= new HouseholdRepository());
  }

  async findById(id: string): Promise<HouseholdRecord | null> {
    const rows: HouseholdRecord[] = await AppDataSource.query(
      `SELECT id, owner_id AS "ownerId", label, note, people, home_type AS "homeType", phone, lga_id AS "lgaId", ward_id AS "wardId" FROM households WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async create(input: NewHousehold, viewerId: string): Promise<HouseholdDto> {
    const [inserted]: { id: string }[] = await AppDataSource.query(
      `INSERT INTO households (owner_id, country_code, lga_id, ward_id, label, note, people, home_type, phone, geom)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $10, $11, ST_SetSRID(ST_MakePoint($8::float8, $9::float8), 4326))
       RETURNING id`,
      [input.ownerId, input.countryCode, input.lgaId, input.wardId, input.label, input.note, input.people, input.longitude, input.latitude, input.homeType, input.phone],
    );
    const rows: Row[] = await AppDataSource.query(`${SELECT("$2", false)} WHERE h.id = $1`, [inserted!.id, viewerId]);
    return toDto(rows[0]!);
  }

  async update(id: string, changes: HouseholdChanges, viewerId: string): Promise<HouseholdDto | null> {
    const [row]: { n: number }[] = await AppDataSource.query(
      `WITH changed AS (UPDATE households SET label = $2, note = $3, people = $4, home_type = $5, phone = $6, updated_at = now() WHERE id = $1 RETURNING 1)
       SELECT count(*)::int AS n FROM changed`,
      [id, changes.label, changes.note, changes.people, changes.homeType, changes.phone],
    );
    if (!row?.n) return null;
    const rows: Row[] = await AppDataSource.query(`${SELECT("$2", false)} WHERE h.id = $1`, [id, viewerId]);
    return rows[0] ? toDto(rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const [row]: { n: number }[] = await AppDataSource.query(`WITH gone AS (DELETE FROM households WHERE id = $1 RETURNING 1) SELECT count(*)::int AS n FROM gone`, [id]);
    return (row?.n ?? 0) > 0;
  }

  async findMine(ownerId: string): Promise<HouseholdDto[]> {
    const rows: Row[] = await AppDataSource.query(`${SELECT("$1", false)} WHERE h.owner_id = $1 ORDER BY h.created_at DESC, h.id`, [ownerId]);
    return rows.map(toDto);
  }

  async findGeoJson([minLon, minLat, maxLon, maxLat]: [number, number, number, number], viewerId: string, all: boolean): Promise<HouseholdFeatureCollection> {
    // Staff (all = true) see everyone's, with the owner's name; anyone else only their own. The viewer's own come first.
    const rows: { fc: HouseholdFeatureCollection }[] = await AppDataSource.query(
      `WITH picked AS (
         SELECT h.id, h.geom, h.label, h.people, h.note, h.home_type, h.phone,
                (SELECT count(*)::int FROM household_photos hp WHERE hp.household_id = h.id) AS photo_count,
                (h.owner_id = $5::uuid) AS mine,
                ${all ? "u.display_name" : "NULL::varchar"} AS owner_name,
                row_number() OVER (ORDER BY (h.owner_id = $5::uuid) DESC, h.id) AS n
           FROM households h ${all ? "LEFT JOIN users u ON u.id = h.owner_id" : ""}
          WHERE h.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
            AND ($6::boolean OR h.owner_id = $5::uuid)
          ORDER BY (h.owner_id = $5::uuid) DESC, h.id
          LIMIT $7::int + 1)
       SELECT json_build_object(
         'type', 'FeatureCollection',
         'truncated', COALESCE(max(n) > $7::int, false),
         'features', COALESCE(json_agg(json_build_object(
           'type', 'Feature', 'id', id,
           'geometry', ST_AsGeoJSON(geom, 6)::json,
           'properties', json_build_object('id', id, 'label', label, 'people', people, 'note', note,
             'homeType', home_type, 'phone', phone, 'photoCount', photo_count, 'mine', mine, 'ownerName', owner_name)
         ) ORDER BY n) FILTER (WHERE n <= $7::int), '[]'::json)) AS fc
       FROM picked`,
      [minLon, minLat, maxLon, maxLat, viewerId, all, HOUSEHOLD_FEATURE_CAP],
    );
    return rows[0]?.fc ?? { type: "FeatureCollection", features: [], truncated: false };
  }

  async ownersNearFlood(floodId: string, metres: number): Promise<{ ownerId: string; label: string; distanceM: number }[]> {
    // Measured on the spheroid from the household to the flood's edge (0 when it is inside).
    return AppDataSource.query(
      `SELECT h.owner_id AS "ownerId", h.label, round(ST_Distance(h.geom::geography, e.geom::geography))::int AS "distanceM"
         FROM flood_extents e
         JOIN households h ON ST_DWithin(h.geom::geography, e.geom::geography, $2::float8)
        WHERE e.id = $1`,
      [floodId, metres],
    );
  }
}
