import { BaseRepository } from "../../common/repository/base.repository";
import { areaCte, reachesArea } from "./area-clip";
import { FACILITY_TYPES, facilityTypesAtZoom, LAYER_FEATURE_LIMIT } from "./layer-rules";
import { Infrastructure } from "./infrastructure.entity";
import type { FacilityHit, IInfrastructureRepository, InfrastructureFeatureCollection, LayerGeoJsonQuery, LayerSummary } from "./map-layer.types";

// Every spatial operation runs in PostGIS, never in JS (section 8). Shapes leave the database
// only through findGeoJson, which needs a bbox and never returns more than the layer's cap.

export class InfrastructureRepository extends BaseRepository<Infrastructure> implements IInfrastructureRepository {
  private static _instance?: InfrastructureRepository;
  static get Instance(): InfrastructureRepository {
    return (this._instance ??= new InfrastructureRepository());
  }

  protected readonly entity = Infrastructure;

  async findGeoJson(query: LayerGeoJsonQuery): Promise<InfrastructureFeatureCollection> {
    const [minLon, minLat, maxLon, maxLat] = query.bbox;
    const limit = LAYER_FEATURE_LIMIT.infrastructure;
    // Points are never simplified. Types come in FACILITY_TYPES order (health first), so the cap,
    // if it bites, drops the least important. One extra row is read only to learn whether it did.
    const rows: { fc: InfrastructureFeatureCollection }[] = await this.repo.query(
      `WITH view AS (SELECT ST_MakeEnvelope($1, $2, $3, $4, 4326) AS box),
            ${areaCte(8)},
            picked AS (
              SELECT f.id, f.name, f.facility_type, f.osm_class, f.origin, f.note, f.phone, f.geom,
                     row_number() OVER (ORDER BY array_position($6::text[], f.facility_type::text), f.name, f.id) AS n
                FROM infrastructure f, view
               WHERE f.geom && view.box AND ST_Intersects(f.geom, view.box)
                 AND f.facility_type = ANY($5::text[])
                 AND ${reachesArea("f.geom", 8)}
               ORDER BY array_position($6::text[], f.facility_type::text), f.name, f.id
               LIMIT $7::int + 1)
       SELECT json_build_object(
         'type', 'FeatureCollection',
         'truncated', COALESCE(max(n) > $7::int, false),
         'features', COALESCE(json_agg(json_build_object(
           'type', 'Feature',
           'id', id,
           'geometry', ST_AsGeoJSON(geom, 6)::json,
           'properties', json_build_object('id', id, 'name', name, 'facilityType', facility_type, 'osmClass', osm_class,
                                           'origin', origin, 'note', note, 'phone', phone)
         ) ORDER BY n) FILTER (WHERE n <= $7::int), '[]'::json)
       ) AS fc
       FROM picked`,
      [minLon, minLat, maxLon, maxLat, facilityTypesAtZoom(query.zoom), [...FACILITY_TYPES], limit, query.within ?? null],
    );
    return rows[0]?.fc ?? { type: "FeatureCollection", features: [], truncated: false };
  }

  /** Name contains `q`; a sequential scan is fine at this layer's size. Unnamed facilities can't be found by name. */
  searchByName(q: string, limit: number): Promise<FacilityHit[]> {
    // LIKE wildcards in the search are escaped, so "50%" means the literal text.
    const escaped = q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
    // Names that start with the search sort before names that only contain it, then health before the rest (FACILITY_TYPES order).
    return this.repo.query(
      `SELECT f.id, f.name, f.facility_type AS "facilityType", f.osm_class AS "osmClass", f.origin,
              ARRAY[round(ST_X(f.geom)::numeric, 6)::float8, round(ST_Y(f.geom)::numeric, 6)::float8] AS point
         FROM infrastructure f
        WHERE f.name ILIKE $1
        ORDER BY (f.name ILIKE $2) DESC, array_position($4::text[], f.facility_type::text), f.name, f.id
        LIMIT $3`,
      [`%${escaped}%`, `${escaped}%`, limit, [...FACILITY_TYPES]],
    );
  }

  async summarise(): Promise<LayerSummary> {
    const rows: LayerSummary[] = await this.repo.query(
      `SELECT count(*)::int AS "featureCount", COALESCE(array_agg(DISTINCT source_id::text), '{}') AS "sourceIds" FROM infrastructure`,
    );
    return rows[0] ?? { featureCount: 0, sourceIds: [] };
  }
}
