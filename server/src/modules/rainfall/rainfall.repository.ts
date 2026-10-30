import { BaseRepository } from "../../common/repository/base.repository";
import type { IRainfallCoverage, RainfallCoverageSummary } from "../public/public.types";
import { RainfallObservation } from "./rainfall-observation.entity";
import type { IRainfallRepository, LiveRainfallValue, RainfallMonthRow } from "./rainfall.types";

export class RainfallRepository extends BaseRepository<RainfallObservation> implements IRainfallRepository, IRainfallCoverage {
  private static _instance?: RainfallRepository;
  static get Instance(): RainfallRepository {
    return (this._instance ??= new RainfallRepository());
  }

  protected readonly entity = RainfallObservation;

  findLiveValues(countryCode: string, level: number): Promise<LiveRainfallValue[]> {
    return this.repo.query(
      `SELECT o.admin_unit_id AS "adminUnitId", o.year_month AS "yearMonth", o.mean_rainfall_mm::float8 AS "rainfallMm"
         FROM rainfall_observations o
         JOIN admin_units au ON au.id = o.admin_unit_id
        WHERE au.country_code = $1 AND au.level = $2`,
      [countryCode, level],
    );
  }

  findSeries(adminUnitId: string, range: { from?: string; to?: string }): Promise<RainfallMonthRow[]> {
    return this.repo.query(
      `SELECT year_month AS "yearMonth", mean_rainfall_mm::float8 AS "rainfallMm", data_type AS "dataType", source_id AS "sourceId"
         FROM rainfall_observations
        WHERE admin_unit_id = $1
          AND ($2::text IS NULL OR year_month >= $2)
          AND ($3::text IS NULL OR year_month <= $3)
        ORDER BY year_month`,
      [adminUnitId, range.from ?? null, range.to ?? null],
    );
  }

  /** The span of months with a value, how many areas have one, and the sources behind them. */
  async findCoverage(): Promise<RainfallCoverageSummary | null> {
    const rows: (RainfallCoverageSummary | { firstMonth: null })[] = await this.repo.query(
      `SELECT min(year_month) AS "firstMonth", max(year_month) AS "lastMonth",
              count(DISTINCT admin_unit_id)::int AS "areaCount",
              COALESCE(array_agg(DISTINCT source_id::text), '{}') AS "sourceIds"
         FROM rainfall_observations
        WHERE mean_rainfall_mm IS NOT NULL`,
    );
    const row = rows[0];
    return row && row.firstMonth !== null ? (row as RainfallCoverageSummary) : null;
  }
}
