import { AppDataSource } from "../../config/data-source";
import { FLOOD_STALE_DAYS, MAX_NEARBY, REPORT_FRESH_HOURS } from "./flood-ahead.rules";
import type { IFloodAheadRepository, NearbyFlood } from "./flood-ahead.types";

interface NearbyRow {
  kind: NearbyFlood["kind"];
  id: string;
  distanceM: number;
  bearingDeg: number | null;
  depth: string | null;
  place: string | null;
  lon: number;
  lat: number;
}

/**
 * Where it is flooded right now, near a position: floods a responder recorded on the ground and has not
 * marked receded (the ones the map draws as "Flood, as recorded", up to FLOOD_STALE_DAYS old), plus
 * community reports published in the last REPORT_FRESH_HOURS. Every distance is measured in PostGIS on
 * the spheroid, to the nearest edge of the flood, not its middle. The position is a query parameter and
 * is never kept or logged.
 */
export class FloodAheadRepository implements IFloodAheadRepository {
  private static _instance?: FloodAheadRepository;
  static get Instance(): FloodAheadRepository {
    return (this._instance ??= new FloodAheadRepository());
  }

  async findNear(lon: number, lat: number, radiusM: number): Promise<NearbyFlood[]> {
    // `box` is a cheap rectangle that is certain to contain the circle, so the spatial index narrows the
    // floods before the exact (and dearer) distance test. A degree of longitude is shorter away from the equator.
    const rows: NearbyRow[] = await AppDataSource.query(
      `WITH me AS (SELECT ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326) AS g),
            box AS (SELECT ST_Expand(me.g, $3::float8 / 111320.0 / GREATEST(cos(radians($2::float8)), 0.05)) AS b FROM me),
            near AS (
              SELECT 'flood'::text AS kind, e.id::text AS id,
                     ST_Distance(e.geom::geography, me.g::geography) AS dist,
                     ST_ClosestPoint(e.geom, me.g) AS spot,
                     e.depth::text AS depth,
                     COALESCE(w.unit_name, a.unit_name) AS place
                FROM flood_extents e
               CROSS JOIN me CROSS JOIN box
                LEFT JOIN admin_units a ON a.id = e.lga_id
                LEFT JOIN admin_units w ON w.id = e.ward_id
               WHERE e.receded_at IS NULL
                 AND e.observed_at > now() - ($4::int * interval '1 day')
                 AND e.geom && box.b
                 AND ST_DWithin(e.geom::geography, me.g::geography, $3::float8)
              UNION ALL
              SELECT 'report'::text, r.id::text,
                     ST_Distance(r.geom::geography, me.g::geography),
                     r.geom,
                     r.water_depth::text,
                     a.unit_name
                FROM flood_reports r
               CROSS JOIN me CROSS JOIN box
                LEFT JOIN admin_units a ON a.id = r.lga_id
               WHERE r.status = 'published'
                 AND r.created_at >= now() - ($5::int * interval '1 hour')
                 AND r.geom && box.b
                 AND ST_DWithin(r.geom::geography, me.g::geography, $3::float8)
            )
       SELECT n.kind, n.id,
              round(n.dist)::int AS "distanceM",
              round(degrees(ST_Azimuth(me.g, n.spot)))::int AS "bearingDeg",
              n.depth, n.place,
              round(ST_X(n.spot)::numeric, 3)::float8 AS lon,
              round(ST_Y(n.spot)::numeric, 3)::float8 AS lat
         FROM near n CROSS JOIN me
        ORDER BY n.dist, n.id
        LIMIT $6::int`,
      [lon, lat, radiusM, FLOOD_STALE_DAYS, REPORT_FRESH_HOURS, MAX_NEARBY],
    );

    return rows.map(({ lon: x, lat: y, bearingDeg, ...rest }) => ({
      ...rest,
      // ST_Azimuth is 360 for due north when rounded up; keep it in 0..359. Null when the person is inside the flood.
      bearingDeg: bearingDeg === null ? null : bearingDeg % 360,
      point: [x, y],
    }));
  }
}
