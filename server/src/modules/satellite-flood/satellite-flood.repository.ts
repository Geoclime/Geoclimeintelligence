import type { EntityManager } from "typeorm";
import { ConflictError, NotFoundError } from "../../common/errors/app-error";
import { BaseRepository } from "../../common/repository/base.repository";
import { SatelliteFloodLayer } from "./satellite-flood-layer.entity";
import type {
  AreaSatelliteFloodMonthDto,
  AreaToMeasure,
  ISatelliteFloodRepository,
  NewSatelliteFloodLayer,
  SatelliteFloodLayerRecord,
} from "./satellite-flood.types";

/** Every column but the picture, with the names the code uses. numeric comes back from pg as text, hence the casts. */
const LAYER_COLUMNS = `l.id, l.country_code AS "countryCode", l.import_run_id AS "importRunId", l.source_id AS "sourceId",
  l.status, l.data_type AS "dataType", l.year_month AS "yearMonth", l.title, l.zoom,
  l.image_width AS "imageWidth", l.image_height AS "imageHeight", l.west, l.south, l.east, l.north,
  l.flooded_km2::float8 AS "floodedKm2", l.covered_km2::float8 AS "coveredKm2",
  l.created_at AS "createdAt", l.promoted_at AS "promotedAt"`;

const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

function pgCode(err: unknown): string | undefined {
  const candidate = err as { code?: unknown; driverError?: { code?: unknown } } | null;
  const code = candidate?.code ?? candidate?.driverError?.code;
  return typeof code === "string" ? code : undefined;
}

export class SatelliteFloodRepository extends BaseRepository<SatelliteFloodLayer> implements ISatelliteFloodRepository {
  private static _instance?: SatelliteFloodRepository;
  static get Instance(): SatelliteFloodRepository {
    return (this._instance ??= new SatelliteFloodRepository());
  }

  protected readonly entity = SatelliteFloodLayer;

  private async oneLayer(where: string, params: unknown[]): Promise<SatelliteFloodLayerRecord | null> {
    const rows: SatelliteFloodLayerRecord[] = await this.repo.query(`SELECT ${LAYER_COLUMNS} FROM satellite_flood_layers l WHERE ${where} LIMIT 1`, params);
    return rows[0] ?? null;
  }

  findLiveByCountry(countryCode: string): Promise<SatelliteFloodLayerRecord[]> {
    return this.repo.query(
      `SELECT ${LAYER_COLUMNS} FROM satellite_flood_layers l WHERE l.country_code = $1 AND l.status = 'live' ORDER BY l.year_month DESC`,
      [countryCode],
    );
  }

  findByRunId(runId: string) {
    return this.oneLayer(`l.import_run_id = $1`, [runId]);
  }

  findLayerById(id: string) {
    return this.oneLayer(`l.id = $1`, [id]);
  }

  async findImage(id: string): Promise<Buffer | null> {
    const rows: { png: Buffer }[] = await this.repo.query(`SELECT mask_png AS png FROM satellite_flood_layers WHERE id = $1`, [id]);
    return rows[0]?.png ?? null;
  }

  /** LGAs and wards, lightly simplified (about 11 m, under a third of a 38 m pixel), with their area on the spheroid. */
  async findAreasToMeasure(countryCode: string): Promise<AreaToMeasure[]> {
    const rows: (Omit<AreaToMeasure, "geometry"> & { geometry: string })[] = await this.repo.query(
      `SELECT au.id, au.unit_name AS "unitName", au.unit_code AS "unitCode", au.level, au.level_name AS "levelName",
              parent.unit_name AS "parentName",
              (ST_Area(au.geom::geography) / 1e6)::float8 AS "areaKm2",
              ST_AsGeoJSON(ST_SimplifyPreserveTopology(au.geom, 0.0001), 6) AS geometry
         FROM admin_units au
         LEFT JOIN admin_units parent ON parent.id = au.parent_id
        WHERE au.country_code = $1 AND au.level >= 2
        ORDER BY au.level, au.unit_name`,
      [countryCode],
    );
    return rows.map((row) => ({ ...row, geometry: JSON.parse(row.geometry) as AreaToMeasure["geometry"] }));
  }

  findAreaMonths(adminUnitId: string): Promise<AreaSatelliteFloodMonthDto[]> {
    return this.repo.query(
      `SELECT l.id AS "layerId", l.year_month AS "yearMonth", f.flooded_km2::float8 AS "floodedKm2", f.measured_km2::float8 AS "measuredKm2",
              CASE WHEN f.measured_km2 > 0 THEN round(f.flooded_km2 / f.measured_km2 * 100, 2)::float8 END AS "percentFlooded"
         FROM admin_unit_satellite_flood f
         JOIN satellite_flood_layers l ON l.id = f.layer_id AND l.status = 'live'
        WHERE f.admin_unit_id = $1
        ORDER BY l.year_month`,
      [adminUnitId],
    );
  }
}

/** Writes the staged month in the import run's own transaction, so a run never exists without its mask. */
export async function insertStagedSatelliteLayer(manager: EntityManager, runId: string, layer: NewSatelliteFloodLayer): Promise<void> {
  const { image } = layer;
  await manager.query(
    `INSERT INTO satellite_flood_layers
       (country_code, import_run_id, source_id, status, year_month, title, zoom, mask_png, image_width, image_height,
        west, south, east, north, flooded_km2, covered_km2, created_by)
     VALUES ($1, $2, $3, 'staged', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    [
      layer.countryCode, runId, layer.sourceId, layer.yearMonth, layer.title, layer.zoom, image.png, image.width, image.height,
      image.west, image.south, image.east, image.north, layer.floodedKm2, layer.coveredKm2, layer.createdBy,
    ],
  );
}

const CHANGED_SINCE =
  "An area this import measured no longer exists (its boundaries were cleared or re-imported since the file was checked). Nothing was made live; upload the file again to re-check it.";

/**
 * Makes the run's month the live one for its country and keeps the area figures. The month's
 * previous live layer, if any, is retired in the same transaction, so there is never two.
 * Returns how many area figures were written.
 */
export async function promoteStagedSatelliteLayer(manager: EntityManager, runId: string): Promise<number> {
  const [staged]: { id: string; countryCode: string; yearMonth: string }[] = await manager.query(
    `SELECT id, country_code AS "countryCode", year_month AS "yearMonth"
       FROM satellite_flood_layers WHERE import_run_id = $1 AND status = 'staged' FOR UPDATE`,
    [runId],
  );
  if (!staged) throw new NotFoundError("Satellite flood month for this import");

  try {
    await manager.query(
      `UPDATE satellite_flood_layers SET status = 'retired' WHERE country_code = $1 AND year_month = $2 AND status = 'live'`,
      [staged.countryCode, staged.yearMonth],
    );
    await manager.query(`UPDATE satellite_flood_layers SET status = 'live', promoted_at = now() WHERE id = $1`, [staged.id]);
    const written: { id: string }[] = await manager.query(
      `INSERT INTO admin_unit_satellite_flood (layer_id, admin_unit_id, flooded_km2, measured_km2)
       SELECT $2, (s.fields->>'adminUnitId')::uuid, (s.fields->>'floodedKm2')::numeric, (s.fields->>'measuredKm2')::numeric
         FROM import_staging_rows s
        WHERE s.run_id = $1 AND s.status = 'passed'
        ORDER BY s.row_number
       RETURNING id`,
      [runId, staged.id],
    );
    return written.length;
  } catch (err) {
    const code = pgCode(err);
    if (code === FOREIGN_KEY_VIOLATION) throw new ConflictError(CHANGED_SINCE);
    if (code === UNIQUE_VIOLATION) {
      throw new ConflictError(`Another import of ${staged.yearMonth} was made live for this country at the same moment. Nothing was changed; try again.`);
    }
    throw err;
  }
}
