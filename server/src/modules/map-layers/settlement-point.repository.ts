import { BaseRepository } from "../../common/repository/base.repository";
import { LAYER_FEATURE_LIMIT } from "./layer-rules";
import type { ISettlementRepository, LayerGeoJsonQuery, LayerSummary, SettlementFeatureCollection } from "./map-layer.types";
import { SettlementPoint } from "./settlement-point.entity";

// Every spatial operation runs in PostGIS, never in JS (section 8). Shapes leave the database
// only through findGeoJson, which needs a bbox and never returns more than the layer's cap.

export class SettlementPointRepository extends BaseRepository<SettlementPoint> implements ISettlementRepository {
  private static _instance?: SettlementPointRepository;
  static get Instance(): SettlementPointRepository {
    return (this._instance ??= new SettlementPointRepository());
  }

  protected readonly entity = SettlementPoint;

  async findGeoJson(query: LayerGeoJsonQuery): Promise<SettlementFeatureCollection> {
    const [minLon, minLat, maxLon, maxLat] = query.bbox;
    const limit = LAYER_FEATURE_LIMIT.settlements;
    // Points are never simplified. Primary settlements come first, so a cap (if it bites) keeps them.
    // One extra row is read only to learn whether the cap cut the layer short.
    const rows: { fc: SettlementFeatureCollection }[] = await this.repo.query(
      `WITH view AS (SELECT ST_MakeEnvelope($1, $2, $3, $4, 4326) AS box),
            picked AS (
              SELECT s.id, s.settlement_name, s.is_primary, s.geom,
                     row_number() OVER (ORDER BY s.is_primary DESC, s.settlement_name, s.id) AS n
                FROM settlement_points s, view
               WHERE s.geom && view.box AND ST_Intersects(s.geom, view.box)
               ORDER BY s.is_primary DESC, s.settlement_name, s.id
               LIMIT $5::int + 1)
       SELECT json_build_object(
         'type', 'FeatureCollection',
         'truncated', COALESCE(max(n) > $5::int, false),
         'features', COALESCE(json_agg(json_build_object(
           'type', 'Feature',
           'id', id,
           'geometry', ST_AsGeoJSON(geom, 6)::json,
           'properties', json_build_object('id', id, 'name', settlement_name, 'isPrimary', is_primary)
         ) ORDER BY n) FILTER (WHERE n <= $5::int), '[]'::json)
       ) AS fc
       FROM picked`,
      [minLon, minLat, maxLon, maxLat, limit],
    );
    return rows[0]?.fc ?? { type: "FeatureCollection", features: [], truncated: false };
  }

  async summarise(): Promise<LayerSummary> {
    const rows: LayerSummary[] = await this.repo.query(
      `SELECT count(*)::int AS "featureCount", COALESCE(array_agg(DISTINCT source_id::text), '{}') AS "sourceIds" FROM settlement_points`,
    );
    return rows[0] ?? { featureCount: 0, sourceIds: [] };
  }
}
