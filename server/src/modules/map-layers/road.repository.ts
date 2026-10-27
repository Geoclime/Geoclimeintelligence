import { BaseRepository } from "../../common/repository/base.repository";
import { LAYER_FEATURE_LIMIT, maxRoadRank, simplifyTolerance } from "./layer-rules";
import type { IRoadRepository, LayerGeoJsonQuery, LayerSummary, RoadFeatureCollection } from "./map-layer.types";
import { Road } from "./road.entity";

// Every spatial operation runs in PostGIS, never in JS (section 8). Shapes leave the database
// only through findGeoJson, which needs a bbox and never returns more than the layer's cap.

export class RoadRepository extends BaseRepository<Road> implements IRoadRepository {
  private static _instance?: RoadRepository;
  static get Instance(): RoadRepository {
    return (this._instance ??= new RoadRepository());
  }

  protected readonly entity = Road;

  async findGeoJson(query: LayerGeoJsonQuery): Promise<RoadFeatureCollection> {
    const [minLon, minLat, maxLon, maxLat] = query.bbox;
    const limit = LAYER_FEATURE_LIMIT.roads;
    // One extra row is read only to learn whether the cap cut the layer short.
    const rows: { fc: RoadFeatureCollection }[] = await this.repo.query(
      `WITH view AS (SELECT ST_MakeEnvelope($1, $2, $3, $4, 4326) AS box),
            picked AS (
              SELECT r.id, r.name, r.road_class, r.surface, r.oneway, r.is_bridge, r.geom,
                     row_number() OVER (ORDER BY r.class_rank, r.id) AS n
                FROM roads r, view
               WHERE r.geom && view.box AND ST_Intersects(r.geom, view.box)
                 AND r.class_rank <= $5::smallint
               ORDER BY r.class_rank, r.id
               LIMIT $6::int + 1)
       SELECT json_build_object(
         'type', 'FeatureCollection',
         'truncated', COALESCE(max(n) > $6::int, false),
         'features', COALESCE(json_agg(json_build_object(
           'type', 'Feature',
           'id', id,
           'geometry', ST_AsGeoJSON(
             CASE WHEN $7::float8 > 0 THEN ST_SimplifyPreserveTopology(geom, $7::float8) ELSE geom END,
             5)::json,
           'properties', json_build_object('id', id, 'name', name, 'roadClass', road_class,
             'surface', surface, 'oneway', oneway, 'isBridge', is_bridge)
         ) ORDER BY n) FILTER (WHERE n <= $6::int), '[]'::json)
       ) AS fc
       FROM picked`,
      [minLon, minLat, maxLon, maxLat, maxRoadRank(query.zoom), limit, simplifyTolerance(query.zoom)],
    );
    return rows[0]?.fc ?? { type: "FeatureCollection", features: [], truncated: false };
  }

  async summarise(): Promise<LayerSummary> {
    const rows: LayerSummary[] = await this.repo.query(
      `SELECT count(*)::int AS "featureCount", COALESCE(array_agg(DISTINCT source_id::text), '{}') AS "sourceIds" FROM roads`,
    );
    return rows[0] ?? { featureCount: 0, sourceIds: [] };
  }
}
