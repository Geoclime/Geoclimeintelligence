import { BaseRepository } from "../../common/repository/base.repository";
import { LAYER_FEATURE_LIMIT, simplifyTolerance, wetlandGeometryColumn } from "./layer-rules";
import type { IWetlandRepository, LayerGeoJsonQuery, LayerSummary, WetlandFeatureCollection } from "./map-layer.types";
import { Wetland } from "./wetland.entity";

// Every spatial operation runs in PostGIS, never in JS (section 8). Shapes leave the database
// only through findGeoJson, which needs a bbox and never returns more than the layer's cap.

export class WetlandRepository extends BaseRepository<Wetland> implements IWetlandRepository {
  private static _instance?: WetlandRepository;
  static get Instance(): WetlandRepository {
    return (this._instance ??= new WetlandRepository());
  }

  protected readonly entity = Wetland;

  async findGeoJson(query: LayerGeoJsonQuery): Promise<WetlandFeatureCollection> {
    const [minLon, minLat, maxLon, maxLat] = query.bbox;
    const limit = LAYER_FEATURE_LIMIT.wetlands;
    // A pre-simplified copy when zoomed out, as for waterways. The column name is one of three fixed
    // values, never user input; the bbox test always uses the indexed full `geom`. Largest first, so a
    // cap drops the smallest patches.
    const column = wetlandGeometryColumn(query.zoom);
    const tolerance = column === "geom" ? simplifyTolerance(query.zoom) : 0;
    const rows: { fc: WetlandFeatureCollection }[] = await this.repo.query(
      `WITH view AS (SELECT ST_MakeEnvelope($1, $2, $3, $4, 4326) AS box),
            picked AS (
              SELECT w.id, w.name, w.wetland_class, w.${column} AS shape,
                     row_number() OVER (ORDER BY ST_Area(w.geom) DESC, w.id) AS n
                FROM wetlands w, view
               WHERE w.geom && view.box AND ST_Intersects(w.geom, view.box)
               ORDER BY ST_Area(w.geom) DESC, w.id
               LIMIT $5::int + 1)
       SELECT json_build_object(
         'type', 'FeatureCollection',
         'truncated', COALESCE(max(n) > $5::int, false),
         'features', COALESCE(json_agg(json_build_object(
           'type', 'Feature',
           'id', id,
           'geometry', ST_AsGeoJSON(
             CASE WHEN $6::float8 > 0 THEN ST_SimplifyPreserveTopology(shape, $6::float8) ELSE shape END,
             5)::json,
           'properties', json_build_object('id', id, 'name', name, 'wetlandClass', wetland_class)
         ) ORDER BY n) FILTER (WHERE n <= $5::int), '[]'::json)
       ) AS fc
       FROM picked`,
      [minLon, minLat, maxLon, maxLat, limit, tolerance],
    );
    return rows[0]?.fc ?? { type: "FeatureCollection", features: [], truncated: false };
  }

  async summarise(): Promise<LayerSummary> {
    const rows: LayerSummary[] = await this.repo.query(
      `SELECT count(*)::int AS "featureCount", COALESCE(array_agg(DISTINCT source_id::text), '{}') AS "sourceIds" FROM wetlands`,
    );
    return rows[0] ?? { featureCount: 0, sourceIds: [] };
  }
}
