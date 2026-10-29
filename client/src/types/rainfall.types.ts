import type { AdminUnitRef } from "./admin-unit.types";
import type { DataSource } from "./data-source.types";

// Mirrors server/src/modules/rainfall/rainfall.types.ts.

export type RainfallDataType = "OBSERVED" | "DERIVED" | "MODELLED" | "ESTIMATED" | "SYNTHETIC";

export interface RainfallMonth {
  /** "YYYY-MM". */
  yearMonth: string;
  /** Null for a month the source hadn't finished: shown as incomplete, never as 0. */
  rainfallMm: number | null;
}

/** GET /api/v1/rainfall?adminUnitId=: one area's monthly rainfall, oldest first. */
export interface RainfallSeries {
  adminUnit: AdminUnitRef;
  months: RainfallMonth[];
  dataTypes: RainfallDataType[];
  sources: DataSource[];
}
