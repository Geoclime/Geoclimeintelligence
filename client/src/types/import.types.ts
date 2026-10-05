import type { FeatureCollection, Geometry } from "geojson";
import type { BBox } from "./admin-unit.types";

// Mirrors server/src/modules/data-sources/imports/import.types.ts.

export type ImportFileType = "xlsx" | "geojson";
export type ImportRunStatus = "checked" | "promoted";
export type StagingRowStatus = "pending" | "passed" | "failed";

export const TEMPLATE_COLUMNS = ["unit_name", "unit_code", "parent_code", "geometry_wkt"] as const;
export type TemplateColumn = (typeof TEMPLATE_COLUMNS)[number];

/** Template column -> the heading in the uploaded file. */
export type ColumnMapping = Partial<Record<TemplateColumn, string>>;

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
  templateColumns: TemplateColumn[];
  suggestedMapping: ColumnMapping;
}

export interface ImportOptions {
  countryCode: string;
  level: number;
  levelName: string;
  parentId: string | null;
}

export interface UserRef {
  id: string;
  email: string | null;
  displayName: string | null;
}

export interface ImportRun {
  id: string;
  target: "admin_units";
  fileName: string;
  fileType: ImportFileType;
  sheetName: string | null;
  options: ImportOptions;
  columnMapping: ColumnMapping;
  source: { id: string; provider: string; datasetName: string };
  status: ImportRunStatus;
  rowCount: number;
  passedCount: number;
  errorCount: number;
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
  errors: string[];
  warnings: string[];
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
}

export interface StartImportInput extends ImportFileOptions {
  countryCode: string;
  level: number;
  sourceId: string;
  parentId?: string;
  columnMapping: ColumnMapping;
}

export type TemplateFormat = "xlsx" | "geojson";

export interface StagingFeatureProperties {
  rowNumber: number;
  status: StagingRowStatus;
  unitName: string | null;
  errorCount: number;
}

export type StagingFeatureCollection = FeatureCollection<Geometry, StagingFeatureProperties>;
