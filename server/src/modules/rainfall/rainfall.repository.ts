import { BaseRepository } from "../../common/repository/base.repository";
import { RainfallObservation } from "./rainfall-observation.entity";
import type { IRainfallRepository, LiveRainfallValue, RainfallMonthRow } from "./rainfall.types";

export class RainfallRepository extends BaseRepository<RainfallObservation> implements IRainfallRepository {
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
}
