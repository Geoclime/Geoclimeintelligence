import { BaseRepository } from "../../common/repository/base.repository";
import { Building } from "./building.entity";
import { BUILDING_MIN_ZOOM, LAYER_FEATURE_LIMIT } from "./layer-rules";
import type { BuildingFeatureCollection, IBuildingRepository, LayerGeoJsonQuery, LayerSummary } from "./map-layer.types";

// Every spatial operation runs in PostGIS, never in JS (section 8). Shapes leave the database
// only through findGeoJson, which needs a bbox and never returns more than the layer's cap.

const EMPTY: BuildingFeatureCollection = { type: "FeatureCollection", features: [], truncated: false };

export class BuildingRepository extends BaseRepository<Building> implements IBuildingRepository {
  private static _instance?: BuildingRepository;
  static get Instance(): BuildingRepository {
    return (this._instance ??= new BuildingRepository());
  }

  protected readonly entity = Building;

  async findGeoJson(query: LayerGeoJsonQuery): Promise<BuildingFeatureCollection> {
    // Below street level there is nothing worth drawing, so the database isn't asked.
    if (query.zoom !== undefined && query.zoom < BUILDING_MIN_ZOOM) return EMPTY;
    const [minLon, minLat, maxLon, maxLat] = query.bbox;
    const limit = LAYER_FEATURE_LIMIT.buildings;
    // Outlines are small, so they are sent as stored (6 decimals is about 10 cm). One extra row is
    // read only to learn whether the cap cut the layer short.
    const rows: { fc: BuildingFeatureCollection }[] = await this.repo.query(
      `WITH view AS (SELECT ST_MakeEnvelope($1, $2, $3, $4, 4326) AS box),
            picked AS (
              SELECT b.id, b.name, b.building_type, b.geom, row_number() OVER (ORDER BY b.id) AS n
                FROM buildings b, view
               WHERE b.geom && view.box AND ST_Intersects(b.geom, view.box)
               ORDER BY b.id
               LIMIT $5::int + 1)
       SELECT json_build_object(
         'type', 'FeatureCollection',
         'truncated', COALESCE(max(n) > $5::int, false),
         'features', COALESCE(json_agg(json_build_object(
           'type', 'Feature',
           'id', id,
           'geometry', ST_AsGeoJSON(geom, 6)::json,
           'properties', json_build_object('id', id, 'name', name, 'buildingType', building_type)
         ) ORDER BY n) FILTER (WHERE n <= $5::int), '[]'::json)
       ) AS fc
       FROM picked`,
      [minLon, minLat, maxLon, maxLat, limit],
    );
    return rows[0]?.fc ?? EMPTY;
  }

  async summarise(): Promise<LayerSummary> {
    // count(*) over 400,000 rows is a fraction of a second; the source list comes from the same scan.
    const rows: LayerSummary[] = await this.repo.query(
      `SELECT count(*)::int AS "featureCount", COALESCE(array_agg(DISTINCT source_id::text), '{}') AS "sourceIds" FROM buildings`,
    );
    return rows[0] ?? { featureCount: 0, sourceIds: [] };
  }
}
