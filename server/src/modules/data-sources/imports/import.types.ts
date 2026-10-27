import type { FeatureCollection, Geometry } from "geojson";
import type { BBox } from "../../../common/geo/geo";
import type { OffsetPageQuery } from "../../../common/pagination/pagination";
import type { PageMeta } from "../../../common/response/api-response";

export const IMPORT_FILE_TYPES = ["xlsx", "geojson", "shapefile", "csv"] as const;
export type ImportFileType = (typeof IMPORT_FILE_TYPES)[number];

/**
 * Whether each row of this kind of file carries its own shape (a GeoJSON feature's geometry, a
 * shapefile record) rather than keeping it as WKT text in a column (Excel, CSV).
 */
export function carriesRowShapes(fileType: ImportFileType): boolean {
  return fileType === "geojson" || fileType === "shapefile";
}

/** Which live table a run feeds. Phase 5 adds the rainfall feed here. */
export type ImportTarget = "admin_units";
export type ImportRunStatus = "checked" | "promoted";
export type StagingRowStatus = "pending" | "passed" | "failed";

/** The columns of the admin-units template's "Areas" sheet, in order. */
export const ADMIN_UNIT_TEMPLATE_COLUMNS = ["unit_name", "unit_code", "parent_code", "geometry_wkt"] as const;
export type TemplateColumn = (typeof ADMIN_UNIT_TEMPLATE_COLUMNS)[number];

/** Template column -> the heading in the uploaded file that holds it. Unmapped = not in the file. */
export type ColumnMapping = Partial<Record<TemplateColumn, string>>;

/** One data row as read from the file, before any checks. */
export interface ParsedRow {
  /**
   * Excel or CSV row number, or the 1-based feature number in a GeoJSON or shapefile: what the
   * admin can find.
   */
  rowNumber: number;
  /** Heading -> cell text (or GeoJSON property / shapefile attribute, as text). */
  values: Record<string, string | null>;
  /**
   * The row's own shape, as GeoJSON geometry text (GeoJSON features and shapefile records).
   * Excel and CSV rows carry their shape in a column instead.
   */
  geometry: string | null;
}

export interface ParsedFile {
  fileType: ImportFileType;
  /** Every sheet in a workbook; empty for every other kind of file. */
  sheets: string[];
  sheetName: string | null;
  /** The Excel or CSV row holding the headings; null for GeoJSON and shapefiles. */
  headerRow: number | null;
  headings: string[];
  rows: ParsedRow[];
  /** Things the reader noticed or assumed that the admin should see (a missing .prj, say). */
  warnings: string[];
}

export interface UploadedFile {
  originalName: string;
  buffer: Buffer;
}

/** The cleaned values for one admin-units row, stored in import_staging_rows.fields. */
export interface AdminUnitStagedFields {
  unitName: string | null;
  unitCode: string | null;
  /** The parent as written in the file (a code or a name), before matching. */
  parentRef: string | null;
  parentId: string | null;
  parentName: string | null;
  levelName: string;
}

export interface StagedRowInput {
  rowNumber: number;
  /** The row's values exactly as read (minus the shape, kept in geomSource). Never edited. */
  raw: Record<string, string | null>;
  geomSource: string | null;
  geomFormat: "wkt" | "geojson" | null;
  fields: AdminUnitStagedFields;
  errors: string[];
  warnings: string[];
}

/** Settings for an admin-units run, stored in import_runs.options. */
export interface AdminUnitImportOptions {
  countryCode: string;
  level: number;
  levelName: string;
  /** Set when the admin picked one parent for every row instead of a parent column. */
  parentId: string | null;
}

export interface NewImportRun {
  target: ImportTarget;
  fileName: string;
  fileType: ImportFileType;
  sheetName: string | null;
  options: AdminUnitImportOptions;
  columnMapping: ColumnMapping;
  sourceId: string;
  createdBy: string;
  warnings: string[];
}

/** What the database-side shape checks need to know about the run. */
export interface GeometryCheckContext {
  countryCode: string;
  /** The country's rough box; null skips that check (with a run warning). */
  bbox: BBox | null;
}

export interface UserRefDto {
  id: string;
  email: string | null;
  displayName: string | null;
}

export interface ImportRunDto {
  id: string;
  target: ImportTarget;
  fileName: string;
  fileType: ImportFileType;
  sheetName: string | null;
  options: AdminUnitImportOptions;
  columnMapping: ColumnMapping;
  source: { id: string; provider: string; datasetName: string };
  status: ImportRunStatus;
  rowCount: number;
  passedCount: number;
  errorCount: number;
  promotedCount: number | null;
  warnings: string[];
  /** Extent of every readable staged shape, for the preview map; null if none could be read. */
  extent: BBox | null;
  createdBy: UserRefDto;
  createdAt: string;
  promotedBy: UserRefDto | null;
  promotedAt: string | null;
}

export interface StagingRowDto {
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

export interface StagingRowQuery extends OffsetPageQuery {
  status?: "passed" | "failed";
}

export interface StagingFeatureProperties {
  rowNumber: number;
  status: StagingRowStatus;
  unitName: string | null;
  errorCount: number;
}

export type StagingFeatureCollection = FeatureCollection<Geometry, StagingFeatureProperties>;

/** What services depend on, so they can be unit-tested with an in-memory fake (section 2). */
export interface IImportRepository {
  /** Creates the run, fills staging and runs the shape checks, all in one transaction. */
  createCheckedRun(run: NewImportRun, rows: StagedRowInput[], checks: GeometryCheckContext): Promise<ImportRunDto>;
  findRunById(id: string): Promise<ImportRunDto | null>;
  findRunPage(query: OffsetPageQuery): Promise<{ items: ImportRunDto[]; meta: PageMeta }>;
  findRowPage(runId: string, query: StagingRowQuery): Promise<{ items: StagingRowDto[]; meta: PageMeta }>;
  findRunGeoJson(runId: string, bbox: BBox): Promise<StagingFeatureCollection>;
  /** Copies passed rows into admin_units and marks the run promoted, in one transaction. */
  promoteAdminUnits(runId: string, userId: string): Promise<number>;
}
