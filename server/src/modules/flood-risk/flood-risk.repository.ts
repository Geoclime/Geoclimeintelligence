import type { EntityManager } from "typeorm";
import { ConflictError, NotFoundError } from "../../common/errors/app-error";
import { BaseRepository } from "../../common/repository/base.repository";
import { FloodRiskLayer } from "./flood-risk-layer.entity";
import type { AreaFigures, AreaToMeasure, FloodRiskLayerRecord, IFloodRiskRepository, NewFloodRiskLayer } from "./flood-risk.types";

/** Every column but the picture and the grid, with the names the code uses. */
const LAYER_COLUMNS = `l.id, l.country_code AS "countryCode", l.import_run_id AS "importRunId", l.source_id AS "sourceId",
  l.status, l.data_type AS "dataType", l.title, l.source_crs AS "sourceCrs", l.cell_size_m AS "cellSizeM",
  l.grid_width AS "gridWidth", l.grid_height AS "gridHeight", l.grid_origin_e AS "originE", l.grid_origin_n AS "originN",
  l.class_cells AS "classCells", l.image_width AS "imageWidth", l.image_height AS "imageHeight",
  l.west, l.south, l.east, l.north, l.created_at AS "createdAt", l.promoted_at AS "promotedAt"`;

const FOREIGN_KEY_VIOLATION = "23503";
const UNIQUE_VIOLATION = "23505";

function pgCode(err: unknown): string | undefined {
  const candidate = err as { code?: unknown; driverError?: { code?: unknown } } | null;
  const code = candidate?.code ?? candidate?.driverError?.code;
  return typeof code === "string" ? code : undefined;
}

export class FloodRiskRepository extends BaseRepository<FloodRiskLayer> implements IFloodRiskRepository {
  private static _instance?: FloodRiskRepository;
  static get Instance(): FloodRiskRepository {
    return (this._instance ??= new FloodRiskRepository());
  }

  protected readonly entity = FloodRiskLayer;

  private async oneLayer(where: string, params: unknown[]): Promise<FloodRiskLayerRecord | null> {
    const rows: FloodRiskLayerRecord[] = await this.repo.query(`SELECT ${LAYER_COLUMNS} FROM flood_risk_layers l WHERE ${where} LIMIT 1`, params);
    return rows[0] ?? null;
  }

  findLiveByCountry(countryCode: string) {
    return this.oneLayer(`l.country_code = $1 AND l.status = 'live'`, [countryCode]);
  }

  findByRunId(runId: string) {
    return this.oneLayer(`l.import_run_id = $1`, [runId]);
  }

  findLayerById(id: string) {
    return this.oneLayer(`l.id = $1`, [id]);
  }

  async findImage(id: string): Promise<Buffer | null> {
    const rows: { png: Buffer }[] = await this.repo.query(`SELECT image_png AS png FROM flood_risk_layers WHERE id = $1`, [id]);
    return rows[0]?.png ?? null;
  }

  async findGrid(id: string): Promise<Buffer | null> {
    const rows: { grid: Buffer }[] = await this.repo.query(`SELECT grid_gz AS grid FROM flood_risk_layers WHERE id = $1`, [id]);
    return rows[0]?.grid ?? null;
  }

  /** LGAs and wards, lightly simplified (about 11 m): far finer than a 100 m cell, and much quicker to fill. */
  async findAreasToMeasure(countryCode: string): Promise<AreaToMeasure[]> {
    const rows: (Omit<AreaToMeasure, "geometry"> & { geometry: string })[] = await this.repo.query(
      `SELECT au.id, au.unit_name AS "unitName", au.unit_code AS "unitCode", au.level, au.level_name AS "levelName",
              parent.unit_name AS "parentName",
              ST_AsGeoJSON(ST_SimplifyPreserveTopology(au.geom, 0.0001), 6) AS geometry
         FROM admin_units au
         LEFT JOIN admin_units parent ON parent.id = au.parent_id
        WHERE au.country_code = $1 AND au.level >= 2
        ORDER BY au.level, au.unit_name`,
      [countryCode],
    );
    return rows.map((row) => ({ ...row, geometry: JSON.parse(row.geometry) as AreaToMeasure["geometry"] }));
  }

  findFiguresAtLevel(layerId: string, level: number): Promise<AreaFigures[]> {
    return this.repo.query(
      `SELECT f.admin_unit_id AS "adminUnitId", f.class_cells AS "classCells"
         FROM admin_unit_flood_risk f
         JOIN admin_units au ON au.id = f.admin_unit_id
        WHERE f.layer_id = $1 AND au.level = $2`,
      [layerId, level],
    );
  }
}

/** Writes the staged layer in the import run's own transaction, so a run never exists without its map. */
export async function insertStagedLayer(manager: EntityManager, runId: string, layer: NewFloodRiskLayer): Promise<void> {
  const { image } = layer;
  await manager.query(
    `INSERT INTO flood_risk_layers
       (country_code, import_run_id, source_id, status, title, source_crs, cell_size_m, grid_width, grid_height,
        grid_origin_e, grid_origin_n, grid_gz, class_cells, image_png, image_width, image_height, west, south, east, north, created_by)
     VALUES ($1, $2, $3, 'staged', $4, $5, $6, $7, $8, $9, $10, $11, $12::int[], $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      layer.countryCode, runId, layer.sourceId, layer.title, layer.sourceCrs, layer.cellSize, layer.gridWidth, layer.gridHeight,
      layer.originE, layer.originN, layer.gridGz, layer.classCells, image.png, image.width, image.height,
      image.west, image.south, image.east, image.north, layer.createdBy,
    ],
  );
}

const CHANGED_SINCE =
  "An area this import measured no longer exists (its boundaries were cleared or re-imported since the file was checked). Nothing was made live; upload the file again to re-check it.";

/**
 * Makes the run's layer the live one for its country and keeps the area figures that passed. The
 * country's previous live layer is retired in the same transaction, so there is never none or two.
 * Returns how many area figures were written.
 */
export async function promoteStagedLayer(manager: EntityManager, runId: string): Promise<number> {
  const [staged]: { id: string; countryCode: string }[] = await manager.query(
    `SELECT id, country_code AS "countryCode" FROM flood_risk_layers WHERE import_run_id = $1 AND status = 'staged' FOR UPDATE`,
    [runId],
  );
  if (!staged) throw new NotFoundError("Flood risk map for this import");

  try {
    await manager.query(`UPDATE flood_risk_layers SET status = 'retired' WHERE country_code = $1 AND status = 'live'`, [staged.countryCode]);
    await manager.query(`UPDATE flood_risk_layers SET status = 'live', promoted_at = now() WHERE id = $1`, [staged.id]);
    const written: { id: string }[] = await manager.query(
      `INSERT INTO admin_unit_flood_risk (layer_id, admin_unit_id, class_cells)
       SELECT $2, (s.fields->>'adminUnitId')::uuid,
              ARRAY(SELECT e::int FROM jsonb_array_elements_text(s.fields->'classCells') WITH ORDINALITY AS t(e, n) ORDER BY n)
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
    if (code === UNIQUE_VIOLATION) throw new ConflictError("Another flood risk map was made live for this country at the same moment. Nothing was changed; try again.");
    throw err;
  }
}
