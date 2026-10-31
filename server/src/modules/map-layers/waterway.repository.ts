import { BaseRepository } from "../../common/repository/base.repository";
import { LAYER_FEATURE_LIMIT, simplifyTolerance, waterClassesAtZoom, waterwayGeometryColumn } from "./layer-rules";
import type { IWaterwayRepository, LayerGeoJsonQuery, LayerSummary, WaterwayFeatureCollection } from "./map-layer.types";
import { Waterway } from "./waterway.entity";

// Every spatial operation runs in PostGIS, never in JS (section 8). Shapes leave the database
// only through findGeoJson, which needs a bbox and never returns more than the layer's cap.

export class WaterwayRepository extends BaseRepository<Waterway> implements IWaterwayRepository {
  private static _instance?: WaterwayRepository;
  static get Instance(): WaterwayRepository {
    return (this._instance ??= new WaterwayRepository());
  }

  protected readonly entity = Waterway;

  async findGeoJson(query: LayerGeoJsonQuery): Promise<WaterwayFeatureCollection> {
    const [minLon, minLat, maxLon, maxLat] = query.bbox;
    const limit = LAYER_FEATURE_LIMIT.waterways;
    // The shape comes from a pre-simplified copy when zoomed out (layer-rules.ts): reading it costs
    // nothing, where simplifying the full shape live took over a second. The name is one of three
    // fixed values, never user input. The bbox test always uses the indexed full `geom`.
    const column = waterwayGeometryColumn(query.zoom);
    const tolerance = column === "geom" ? simplifyTolerance(query.zoom) : 0;
    // Rivers first, then creeks, then the rest, so the cap (if it bites) drops the least important.
    // One extra row is read only to learn whether the cap cut the layer short.
    const rows: { fc: WaterwayFeatureCollection }[] = await this.repo.query(
      `WITH view AS (SELECT ST_MakeEnvelope($1, $2, $3, $4, 4326) AS box),
            picked AS (
              SELECT w.id, w.name, w.water_class, w.waterway_type, w.tunnel, w.${column} AS shape,
                     row_number() OVER (ORDER BY (CASE w.water_class WHEN 'river' THEN 1 WHEN 'creek' THEN 2 ELSE 3 END), w.id) AS n
                FROM waterways w, view
               WHERE w.geom && view.box AND ST_Intersects(w.geom, view.box)
                 AND w.water_class = ANY($5::text[])
               ORDER BY (CASE w.water_class WHEN 'river' THEN 1 WHEN 'creek' THEN 2 ELSE 3 END), w.id
               LIMIT $6::int + 1)
       SELECT json_build_object(
         'type', 'FeatureCollection',
         'truncated', COALESCE(max(n) > $6::int, false),
         'features', COALESCE(json_agg(json_build_object(
           'type', 'Feature',
           'id', id,
           'geometry', ST_AsGeoJSON(
             CASE WHEN $7::float8 > 0 THEN ST_SimplifyPreserveTopology(shape, $7::float8) ELSE shape END,
             5)::json,
           'properties', json_build_object('id', id, 'name', name, 'waterClass', water_class,
             'waterwayType', waterway_type, 'tunnel', tunnel)
         ) ORDER BY n) FILTER (WHERE n <= $6::int), '[]'::json)
       ) AS fc
       FROM picked`,
      [minLon, minLat, maxLon, maxLat, waterClassesAtZoom(query.zoom), limit, tolerance],
    );
    return rows[0]?.fc ?? { type: "FeatureCollection", features: [], truncated: false };
  }

  async summarise(): Promise<LayerSummary> {
    const rows: LayerSummary[] = await this.repo.query(
      `SELECT count(*)::int AS "featureCount", COALESCE(array_agg(DISTINCT source_id::text), '{}') AS "sourceIds" FROM waterways`,
    );
    return rows[0] ?? { featureCount: 0, sourceIds: [] };
  }
}
