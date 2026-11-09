import type { FeatureCollection, Geometry } from "geojson";
import type { BBox } from "./admin-unit.types";

// Mirrors server/src/modules/data-sources/imports/import.types.ts.

export type ImportFileType = "xlsx" | "geojson" | "shapefile" | "csv" | "geotiff" | "mbtiles";
export type ImportRunStatus = "checked" | "promoted";
export type StagingRowStatus = "pending" | "passed" | "failed";
/** Which live table a run feeds: areas, monthly rainfall per area, a flood risk map, or a month of satellite flood extent. */
export type ImportTarget = "admin_units" | "rainfall_observations" | "flood_risk_layers" | "satellite_flood_layers";

export const TEMPLATE_COLUMNS = ["unit_name", "unit_code", "parent_code", "geometry_wkt"] as const;
export type TemplateColumn = (typeof TEMPLATE_COLUMNS)[number];

/** Template column -> the heading in the uploaded file. */
export type ColumnMapping = Partial<Record<TemplateColumn, string>>;

/** What a rainfall file must say per row: the area (code or name), the month and the rainfall. */
export const RAINFALL_COLUMNS = ["area_code", "area_name", "year_month", "rainfall_mm"] as const;
export type RainfallColumn = (typeof RAINFALL_COLUMNS)[number];
export type RainfallColumnMapping = Partial<Record<RainfallColumn, string>>;

/** What promoting a rainfall row does: add a month, fill an incomplete one, replace a value, or nothing. */
export type RainfallChange = "new" | "filled" | "revised" | "unchanged";

/** POST /api/v1/imports/preview: the file's headings and a suggested mapping. Stores nothing. */
export interface ImportPreview {
  fileName: string;
  fileType: ImportFileType;
  sheets: string[];
  sheetName: string | null;
  headerRow: number | null;
  headings: string[];
  rowCount: number;
  sampleRows: Record<string, string | null>[];
  /** The areas template's columns, or the rainfall ones when the preview was for rainfall. */
  templateColumns: (TemplateColumn | RainfallColumn)[];
  suggestedMapping: ColumnMapping & RainfallColumnMapping;
  /** What the server assumed or noticed in the file (a shapefile with no .prj, say). */
  warnings: string[];
}

export interface ImportOptions {
  countryCode: string;
  /** The level imported, or for rainfall the level of the areas it is for. A flood risk map has none. */
  level?: number;
  levelName?: string;
  /** Areas only. */
  parentId?: string | null;
  /** Rainfall: OBSERVED, MODELLED... A flood risk map is always DERIVED. */
  dataType?: string;
  /** Flood risk map and satellite flood month. */
  title?: string;
  /** Satellite flood month only: "YYYY-MM". */
  yearMonth?: string;
}

export interface UserRef {
  id: string;
  email: string | null;
  displayName: string | null;
}

export interface ImportRun {
  id: string;
  target: ImportTarget;
  fileName: string;
  fileType: ImportFileType;
  sheetName: string | null;
  options: ImportOptions;
  columnMapping: ColumnMapping & RainfallColumnMapping;
  source: { id: string; provider: string; datasetName: string };
  status: ImportRunStatus;
  rowCount: number;
  passedCount: number;
  errorCount: number;
  /** Rows Promote would write (passed, less rainfall already live with the same value). Null in lists. */
  promotableCount: number | null;
  promotedCount: number | null;
  warnings: string[];
  /** Extent of the staged shapes; null in lists, or when no shape could be read. */
  extent: BBox | null;
  createdBy: UserRef;
  createdAt: string;
  promotedBy: UserRef | null;
  promotedAt: string | null;
}

export interface StagingRow {
  id: string;
  rowNumber: number;
  status: StagingRowStatus;
  unitName: string | null;
  unitCode: string | null;
  parentRef: string | null;
  parentName: string | null;
  hasShape: boolean;
  /** Rainfall rows only. */
  yearMonth: string | null;
  rainfallMm: number | null;
  change: RainfallChange | null;
  /** Flood risk rows only (one per LGA and ward). */
  risk: StagingRowRisk | null;
  /** Satellite flood rows only (one per LGA and ward). */
  water: StagingRowWater | null;
  errors: string[];
  warnings: string[];
}

/** What the satellite flood review table shows for an area: how much of it was water that month. */
export interface StagingRowWater {
  levelName: string;
  floodedKm2: number;
  /** The part of the area the tiles cover. */
  measuredKm2: number;
  areaKm2: number;
  /** Share of the measured part that was water, 0 to 100; null when the tiles don't reach the area. */
  percentFlooded: number | null;
}

/** What the flood risk review table shows for an area: how much of it is in which class. */
export interface StagingRowRisk {
  levelName: string;
  /** Area that holds a class, in km2. */
  areaKm2: number;
  /** Share of classified cells that are high or very high, 0 to 100; null when the map has none here. */
  percentHigh: number | null;
  /** Mean class, 1 to 5; null when the map has none here. */
  meanClass: number | null;
}

/** GET /api/v1/imports/:id: the run plus one page of its staged rows. */
export interface ImportRunDetail {
  run: ImportRun;
  rows: StagingRow[];
}

export interface ImportRowParams {
  page: number;
  pageSize: number;
  status?: "passed" | "failed";
}

/** The shared fields of the preview and start uploads. */
export interface ImportFileOptions {
  file: File;
  sheetName?: string;
  headerRow?: number;
}

export interface PreviewImportInput extends ImportFileOptions {
  countryCode?: string;
  level?: number;
  parentId?: string;
  /** Rainfall opens the rainfall sheet and guesses the rainfall columns. Areas by default. */
  target?: ImportTarget;
}

export interface StartImportInput extends ImportFileOptions {
  countryCode: string;
  level: number;
  sourceId: string;
  parentId?: string;
  columnMapping: ColumnMapping;
}

/** POST /api/v1/imports/rainfall: monthly rainfall for the live areas at `level`. */
export interface StartRainfallImportInput extends ImportFileOptions {
  countryCode: string;
  level: number;
  sourceId: string;
  columnMapping: RainfallColumnMapping;
}

export type TemplateFormat = "xlsx" | "geojson";

export interface StagingFeatureProperties {
  rowNumber: number;
  status: StagingRowStatus;
  unitName: string | null;
  errorCount: number;
}

export type StagingFeatureCollection = FeatureCollection<Geometry, StagingFeatureProperties>;
