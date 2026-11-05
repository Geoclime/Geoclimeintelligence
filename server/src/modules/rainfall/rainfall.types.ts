import type { AdminUnitRef } from "../admin-units/admin-unit.types";
import type { DataSourceDto } from "../data-sources/data-source.types";

/** The ERD's data_type values: an estimate is never presented as an observation. */
export type RainfallDataType = "OBSERVED" | "DERIVED" | "MODELLED" | "ESTIMATED" | "SYNTHETIC";

/** One live month, as the import checks compare against it. */
export interface LiveRainfallValue {
  adminUnitId: string;
  /** "YYYY-MM". */
  yearMonth: string;
  /** Null for a month stored as incomplete. */
  rainfallMm: number | null;
}

/** One month of an area's series, with where it came from. */
export interface RainfallMonthRow {
  yearMonth: string;
  rainfallMm: number | null;
  dataType: RainfallDataType;
  sourceId: string;
}

export interface RainfallMonthDto {
  /** "YYYY-MM". */
  yearMonth: string;
  /** Null for a month the source hadn't finished: shown as incomplete, never as 0. */
  rainfallMm: number | null;
}

/** GET /api/v1/rainfall?adminUnitId=: one area's monthly rainfall, oldest first. */
export interface RainfallSeriesDto {
  adminUnit: AdminUnitRef;
  months: RainfallMonthDto[];
  /** Every data_type in the series, so the screen can say "observed" only when it is. */
  dataTypes: RainfallDataType[];
  /** Every source the months came from, for credit and licensing. */
  sources: DataSourceDto[];
}

/** What services depend on, so they can be unit-tested with an in-memory fake (section 2). */
export interface IRainfallRepository {
  /** Every live month for a country's areas at one level, for the import's change checks. */
  findLiveValues(countryCode: string, level: number): Promise<LiveRainfallValue[]>;
  /** One area's months, oldest first, optionally from/to "YYYY-MM" (inclusive). */
  findSeries(adminUnitId: string, range: { from?: string; to?: string }): Promise<RainfallMonthRow[]>;
}
