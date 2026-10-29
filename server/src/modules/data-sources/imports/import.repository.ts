import type { EntityManager } from "typeorm";
import { ConflictError, NotFoundError } from "../../../common/errors/app-error";
import type { BBox } from "../../../common/geo/geo";
import type { OffsetPageQuery } from "../../../common/pagination/pagination";
import { BaseRepository } from "../../../common/repository/base.repository";
import type { PageMeta } from "../../../common/response/api-response";
import { SHAPE_CHECKS, VERDICT_CHECKS } from "./import-checks.sql";
import { ImportRun } from "./import-run.entity";
import type {
  AdminUnitStagedFields,
  GeometryCheckContext,
  IImportRepository,
  ImportRunDto,
  NewImportRun,
  RainfallStagedFields,
  StagedRowInput,
  StagingFeatureCollection,
  StagingRowDto,
  StagingRowQuery,
} from "./import.types";

const userJson = (alias: string) =>
  `json_build_object('id', ${alias}.id, 'email', ${alias}.email, 'displayName', ${alias}.display_name)`;

/** `extent` and `promotableCount` cost an aggregate over the run's rows, so only single-run reads include them. */
function runSelect(detail: boolean): string {
  const extent = detail
    ? `(SELECT CASE WHEN x.e IS NULL THEN NULL ELSE ARRAY[ST_XMin(x.e), ST_YMin(x.e), ST_XMax(x.e), ST_YMax(x.e)] END
          FROM (SELECT ST_Extent(geom) AS e FROM import_staging_rows WHERE run_id = r.id) x)`
    : "NULL::float8[]";
  // Rainfall months already live with the same value pass, but Promote has nothing to write for them.
  const promotable = detail
    ? `(SELECT count(*)::int FROM import_staging_rows
         WHERE run_id = r.id AND status = 'passed' AND fields->>'change' IS DISTINCT FROM 'unchanged')`
    : "NULL::int";
  return `SELECT r.id, r.target, r.file_name AS "fileName", r.file_type AS "fileType", r.sheet_name AS "sheetName",
      r.options, r.column_mapping AS "columnMapping",
      json_build_object('id', ds.id, 'provider', ds.provider, 'datasetName', ds.dataset_name) AS source,
      r.status, r.row_count AS "rowCount", r.passed_count AS "passedCount", r.error_count AS "errorCount",
      ${promotable} AS "promotableCount", r.promoted_count AS "promotedCount", r.warnings, ${extent} AS extent,
      ${userJson("cu")} AS "createdBy", r.created_at AS "createdAt",
      CASE WHEN pu.id IS NULL THEN NULL ELSE ${userJson("pu")} END AS "promotedBy", r.promoted_at AS "promotedAt"
    FROM import_runs r
    JOIN data_sources ds ON ds.id = r.source_id
    JOIN users cu ON cu.id = r.created_by
    LEFT JOIN users pu ON pu.id = r.promoted_by`;
}

type RunRow = Omit<ImportRunDto, "createdAt" | "promotedAt"> & { createdAt: Date; promotedAt: Date | null };

function toRunDto(row: RunRow): ImportRunDto {
  return {
    ...row,
    extent: row.extent ? (row.extent.map((n) => Math.round(n * 1e6) / 1e6) as BBox) : null,
    createdAt: row.createdAt.toISOString(),
    promotedAt: row.promotedAt ? row.promotedAt.toISOString() : null,
  };
}

/** Postgres error codes the promotion turns into a 409 instead of a 500. */
const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

function pgCode(err: unknown): string | undefined {
  const candidate = err as { code?: unknown; driverError?: { code?: unknown } } | null;
  const code = candidate?.code ?? candidate?.driverError?.code;
  return typeof code === "string" ? code : undefined;
}

export class ImportRepository extends BaseRepository<ImportRun> implements IImportRepository {
  private static _instance?: ImportRepository;
  static get Instance(): ImportRepository {
    return (this._instance ??= new ImportRepository());
  }

  protected readonly entity = ImportRun;

  async createCheckedRun(
    run: NewImportRun,
    rows: StagedRowInput<AdminUnitStagedFields>[] | StagedRowInput<RainfallStagedFields>[],
    checks: GeometryCheckContext | null,
  ): Promise<ImportRunDto> {
    const runId = await this.repo.manager.transaction(async (manager) => {
      const [created]: { id: string }[] = await manager.query(
        `INSERT INTO import_runs
           (target, file_name, file_type, sheet_name, options, column_mapping, source_id, status, warnings, created_by)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, 'checked', $8::text[], $9)
         RETURNING id`,
        [
          run.target, run.fileName, run.fileType, run.sheetName, JSON.stringify(run.options),
          JSON.stringify(run.columnMapping), run.sourceId, run.warnings, run.createdBy,
        ],
      );
      const id = created!.id;
      await insertStagingRows(manager, id, rows);
      if (checks) {
        for (const check of SHAPE_CHECKS) {
          await manager.query(check.sql, check.withBBox ? [id, checks.countryCode, checks.bbox] : [id]);
        }
      }
      for (const check of VERDICT_CHECKS) await manager.query(check.sql, [id]);
      return id;
    });

    const created = await this.findRunById(runId);
    if (!created) throw new NotFoundError("Import run");
    return created;
  }

  async findRunById(id: string): Promise<ImportRunDto | null> {
    const rows: RunRow[] = await this.repo.query(`${runSelect(true)} WHERE r.id = $1`, [id]);
    return rows[0] ? toRunDto(rows[0]) : null;
  }

  async findRunPage(query: OffsetPageQuery): Promise<{ items: ImportRunDto[]; meta: PageMeta }> {
    const [rows, [count]] = await Promise.all([
      this.repo.query(`${runSelect(false)} ORDER BY r.created_at DESC, r.id DESC LIMIT $1 OFFSET $2`, [
        query.pageSize,
        (query.page - 1) * query.pageSize,
      ]) as Promise<RunRow[]>,
      this.repo.query(`SELECT count(*)::int AS total FROM import_runs`) as Promise<{ total: number }[]>,
    ]);
    return { items: rows.map(toRunDto), meta: { page: query.page, pageSize: query.pageSize, total: count?.total ?? 0 } };
  }

  async findRowPage(runId: string, query: StagingRowQuery): Promise<{ items: StagingRowDto[]; meta: PageMeta }> {
    const where = `WHERE run_id = $1 AND ($2::text IS NULL OR status = $2)`;
    const params = [runId, query.status ?? null];
    const [items, [count]] = await Promise.all([
      this.repo.query(
        `SELECT id, row_number AS "rowNumber", status,
                fields->>'unitName' AS "unitName", fields->>'unitCode' AS "unitCode",
                fields->>'parentRef' AS "parentRef", fields->>'parentName' AS "parentName",
                geom IS NOT NULL AS "hasShape",
                fields->>'yearMonth' AS "yearMonth", (fields->>'rainfallMm')::float8 AS "rainfallMm",
                fields->>'change' AS change, errors, warnings
           FROM import_staging_rows ${where}
          ORDER BY row_number LIMIT $3 OFFSET $4`,
        [...params, query.pageSize, (query.page - 1) * query.pageSize],
      ) as Promise<StagingRowDto[]>,
      this.repo.query(`SELECT count(*)::int AS total FROM import_staging_rows ${where}`, params) as Promise<
        { total: number }[]
      >,
    ]);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total: count?.total ?? 0 } };
  }

  async findRunGeoJson(runId: string, [minLon, minLat, maxLon, maxLat]: BBox): Promise<StagingFeatureCollection> {
    const rows: { fc: StagingFeatureCollection }[] = await this.repo.query(
      `WITH view AS (SELECT ST_MakeEnvelope($2, $3, $4, $5, 4326) AS box)
       SELECT json_build_object('type', 'FeatureCollection', 'features', COALESCE(json_agg(json_build_object(
         'type', 'Feature',
         'id', s.row_number,
         'geometry', ST_AsGeoJSON(s.geom, 6)::json,
         'properties', json_build_object('rowNumber', s.row_number, 'status', s.status,
            'unitName', s.fields->>'unitName', 'errorCount', cardinality(s.errors))
       ) ORDER BY s.row_number), '[]'::json)) AS fc
       FROM import_staging_rows s, view
       WHERE s.run_id = $1 AND s.geom IS NOT NULL AND s.geom && view.box AND ST_Intersects(s.geom, view.box)`,
      [runId, minLon, minLat, maxLon, maxLat],
    );
    return rows[0]?.fc ?? { type: "FeatureCollection", features: [] };
  }

  async promote(runId: string, userId: string): Promise<number> {
    return this.repo.manager.transaction(async (manager) => {
      // Row lock: two Promote clicks at once queue here, and the second sees "promoted".
      const [run]: { status: string; target: string }[] = await manager.query(
        `SELECT status, target FROM import_runs WHERE id = $1 FOR UPDATE`,
        [runId],
      );
      if (!run) throw new NotFoundError("Import run");
      if (run.status === "promoted") throw new ConflictError("This import has already been promoted");

      const written = run.target === "rainfall_observations" ? await promoteRainfall(manager, runId) : await promoteAdminUnits(manager, runId);

      await manager.query(
        `UPDATE import_runs SET status = 'promoted', promoted_count = $2, promoted_by = $3, promoted_at = now() WHERE id = $1`,
        [runId, written, userId],
      );
      return written;
    });
  }
}

async function promoteAdminUnits(manager: EntityManager, runId: string): Promise<number> {
  try {
    const inserted: { id: string }[] = await manager.query(
      `INSERT INTO admin_units
         (country_code, parent_id, level, level_name, unit_name, unit_code, geom, source_id, import_run_id)
       SELECT r.options->>'countryCode', (s.fields->>'parentId')::uuid, (r.options->>'level')::smallint,
              s.fields->>'levelName', s.fields->>'unitName', s.fields->>'unitCode',
              ST_Multi(s.geom), r.source_id, r.id
         FROM import_staging_rows s JOIN import_runs r ON r.id = s.run_id
        WHERE s.run_id = $1 AND s.status = 'passed'
        ORDER BY s.row_number
       RETURNING id`,
      [runId],
    );
    return inserted.length;
  } catch (err) {
    // Something changed since the checks ran (another run promoted the same area, or a
    // parent was removed). The transaction rolls back, so nothing at all was copied.
    const code = pgCode(err);
    if (code === UNIQUE_VIOLATION) {
      throw new ConflictError("Some of these areas are already live (another import added them since this one was checked). Nothing was copied; upload the file again to re-check it.");
    }
    if (code === FOREIGN_KEY_VIOLATION) {
      throw new ConflictError("A parent area this import relies on no longer exists. Nothing was copied; upload the file again to re-check it.");
    }
    throw err;
  }
}

const RAINFALL_CHANGED_SINCE =
  "Rainfall for some of these months has changed since this file was checked (another import was promoted, or an area was cleared). Nothing was copied; upload the file again to re-check it.";

/**
 * Writes the passed rainfall rows that change something: new months, incomplete months filled
 * in, and revised values. Every row was checked against what was live then; if any of those
 * months has changed since, the whole promotion is refused, so a value the admin never saw
 * is never overwritten.
 */
async function promoteRainfall(manager: EntityManager, runId: string): Promise<number> {
  // Rainfall promotions queue behind each other here, so the check below can't race another run's write.
  await manager.query(`LOCK TABLE rainfall_observations IN SHARE ROW EXCLUSIVE MODE`);
  const [stale]: { count: number }[] = await manager.query(
    `SELECT count(*)::int AS count
       FROM import_staging_rows s
       LEFT JOIN rainfall_observations o
         ON o.admin_unit_id = (s.fields->>'adminUnitId')::uuid AND o.year_month = s.fields->>'yearMonth'
      WHERE s.run_id = $1 AND s.status = 'passed' AND s.fields->>'change' <> 'unchanged'
        AND ((o.id IS NULL) = (s.fields->>'liveExists')::boolean
             OR o.mean_rainfall_mm IS DISTINCT FROM (s.fields->>'liveRainfallMm')::numeric)`,
    [runId],
  );
  if ((stale?.count ?? 0) > 0) throw new ConflictError(RAINFALL_CHANGED_SINCE);

  try {
    const written: { id: string }[] = await manager.query(
      `INSERT INTO rainfall_observations
         (country_code, admin_unit_id, year_month, mean_rainfall_mm, data_type, source_id, import_run_id)
       SELECT r.options->>'countryCode', (s.fields->>'adminUnitId')::uuid, s.fields->>'yearMonth',
              (s.fields->>'rainfallMm')::numeric, r.options->>'dataType', r.source_id, r.id
         FROM import_staging_rows s JOIN import_runs r ON r.id = s.run_id
        WHERE s.run_id = $1 AND s.status = 'passed' AND s.fields->>'change' <> 'unchanged'
        ORDER BY s.row_number
       ON CONFLICT (admin_unit_id, year_month) DO UPDATE
          SET mean_rainfall_mm = EXCLUDED.mean_rainfall_mm, data_type = EXCLUDED.data_type,
              source_id = EXCLUDED.source_id, import_run_id = EXCLUDED.import_run_id, updated_at = now()
       RETURNING id`,
      [runId],
    );
    return written.length;
  } catch (err) {
    if (pgCode(err) === FOREIGN_KEY_VIOLATION) throw new ConflictError(RAINFALL_CHANGED_SINCE);
    throw err;
  }
}

/** One statement for the whole file: the rows travel as one JSON array, not one INSERT each. */
async function insertStagingRows(
  manager: EntityManager,
  runId: string,
  rows: StagedRowInput<AdminUnitStagedFields>[] | StagedRowInput<RainfallStagedFields>[],
): Promise<void> {
  if (rows.length === 0) return;
  const payload = rows.map((row) => ({
    row_number: row.rowNumber,
    raw: row.raw,
    geom_source: row.geomSource,
    geom_format: row.geomFormat,
    fields: row.fields,
    errors: row.errors,
    warnings: row.warnings,
  }));
  await manager.query(
    `INSERT INTO import_staging_rows (run_id, row_number, raw, geom_source, geom_format, fields, errors, warnings)
     SELECT $1, r.row_number, r.raw, r.geom_source, r.geom_format, r.fields, r.errors, r.warnings
       FROM json_to_recordset($2::json)
         AS r(row_number int, raw jsonb, geom_source text, geom_format text, fields jsonb, errors text[], warnings text[])`,
    [runId, JSON.stringify(payload)],
  );
}
