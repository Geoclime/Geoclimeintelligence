import type { FeatureCollection, Geometry } from "geojson";
import type { BBox } from "../../../common/geo/geo";
import type { OffsetPageQuery } from "../../../common/pagination/pagination";
import type { PageMeta } from "../../../common/response/api-response";
import type { FloodRiskStagedFields, NewFloodRiskLayer } from "../../flood-risk/flood-risk.types";
import type { RainfallDataType } from "../../rainfall/rainfall.types";
import type { NewSatelliteFloodLayer, SatelliteFloodStagedFields } from "../../satellite-flood/satellite-flood.types";

export const IMPORT_FILE_TYPES = ["xlsx", "geojson", "shapefile", "csv", "geotiff", "mbtiles"] as const;
export type ImportFileType = (typeof IMPORT_FILE_TYPES)[number];

/**
 * Whether each row of this kind of file carries its own shape (a GeoJSON feature's geometry, a
 * shapefile record) rather than keeping it as WKT text in a column (Excel, CSV).
 */
export function carriesRowShapes(fileType: ImportFileType): boolean {
  return fileType === "geojson" || fileType === "shapefile";
}

/**
 * Which live table a run feeds: areas (Phase 2), monthly rainfall per area (Phase 5), a flood risk
 * map, or one month of satellite flood extent.
 */
export const IMPORT_TARGETS = ["admin_units", "rainfall_observations", "flood_risk_layers", "satellite_flood_layers"] as const;
export type ImportTarget = (typeof IMPORT_TARGETS)[number];
export type ImportRunStatus = "checked" | "promoted";
export type StagingRowStatus = "pending" | "passed" | "failed";

/** The columns of the admin-units template's "Areas" sheet, in order. */
export const ADMIN_UNIT_TEMPLATE_COLUMNS = ["unit_name", "unit_code", "parent_code", "geometry_wkt"] as const;
export type TemplateColumn = (typeof ADMIN_UNIT_TEMPLATE_COLUMNS)[number];

/** Template column -> the heading in the uploaded file that holds it. Unmapped = not in the file. */
export type ColumnMapping = Partial<Record<TemplateColumn, string>>;

/**
 * What a rainfall file must say for each row: which area (its code, its name, or both), which
 * month, and how much rain. CHIRPS from Earth Engine writes these as ADM2_PCODE, ADM2_EN,
 * year_month and mean.
 */
export const RAINFALL_COLUMNS = ["area_code", "area_name", "year_month", "rainfall_mm"] as const;
export type RainfallColumn = (typeof RAINFALL_COLUMNS)[number];
export type RainfallColumnMapping = Partial<Record<RainfallColumn, string>>;

/**
 * What promoting a rainfall row would do to the live table: add a month, fill in one stored as
 * incomplete, replace a different value, or nothing (already live with the same value).
 */
export type RainfallChange = "new" | "filled" | "revised" | "unchanged";

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

/** The cleaned values for one rainfall row, stored in import_staging_rows.fields. */
export interface RainfallStagedFields {
  /** The live area the row matched; null when it matched none (the row fails). */
  adminUnitId: string | null;
  /** The matched area's name and code, or what the file said when nothing matched. */
  unitName: string | null;
  unitCode: string | null;
  /** "YYYY-MM". */
  yearMonth: string | null;
  /** Rounded to 3 decimals, as stored; null for an incomplete month. */
  rainfallMm: number | null;
  change: RainfallChange | null;
  /** What was live for this area and month when the file was checked. Promote refuses if it has changed since. */
  liveExists: boolean;
  liveRainfallMm: number | null;
}

export type StagedFields = AdminUnitStagedFields | RainfallStagedFields | FloodRiskStagedFields | SatelliteFloodStagedFields;

/** The rows of one run, all of one kind. */
export type StagedRows =
  | StagedRowInput<AdminUnitStagedFields>[]
  | StagedRowInput<RainfallStagedFields>[]
  | StagedRowInput<FloodRiskStagedFields>[]
  | StagedRowInput<SatelliteFloodStagedFields>[];

export interface StagedRowInput<F extends StagedFields = AdminUnitStagedFields> {
  rowNumber: number;
  /** The row's values exactly as read (minus the shape, kept in geomSource). Never edited. */
  raw: Record<string, string | null>;
  geomSource: string | null;
  geomFormat: "wkt" | "geojson" | null;
  fields: F;
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

/** Settings for a rainfall run, stored in import_runs.options. */
export interface RainfallImportOptions {
  countryCode: string;
  /** The level of the areas the rainfall is for (2 = LGA in Nigeria). */
  level: number;
  levelName: string;
  dataType: RainfallDataType;
}

/** Settings for a flood risk run, stored in import_runs.options. */
export interface FloodRiskImportOptions {
  countryCode: string;
  /** A modelled judgement of where it could flood, never an observation. */
  dataType: "DERIVED";
  title: string;
}

/** Settings for a satellite flood run (one month's tiles), stored in import_runs.options. */
export interface SatelliteFloodImportOptions {
  countryCode: string;
  /** Radar observed, water inferred by a threshold. */
  dataType: "DERIVED";
  title: string;
  /** "YYYY-MM". */
  yearMonth: string;
}

export type ImportOptions = AdminUnitImportOptions | RainfallImportOptions | FloodRiskImportOptions | SatelliteFloodImportOptions;

export interface NewImportRun {
  target: ImportTarget;
  fileName: string;
  fileType: ImportFileType;
  sheetName: string | null;
  options: ImportOptions;
  columnMapping: ColumnMapping | RainfallColumnMapping;
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
  options: ImportOptions;
  columnMapping: ColumnMapping | RainfallColumnMapping;
  source: { id: string; provider: string; datasetName: string };
  status: ImportRunStatus;
  rowCount: number;
  passedCount: number;
  errorCount: number;
  /**
   * How many rows Promote would write: the passed rows, less rainfall months already live with
   * the same value. Single-run reads only; null in lists.
   */
  promotableCount: number | null;
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
  /** Rainfall rows only; null for areas. */
  yearMonth: string | null;
  rainfallMm: number | null;
  change: RainfallChange | null;
  /** Flood risk rows only (one per LGA and ward); null otherwise. */
  risk: StagingRowRisk | null;
  /** Satellite flood rows only (one per LGA and ward); null otherwise. */
  water: StagingRowWater | null;
  errors: string[];
  warnings: string[];
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
  /**
   * Creates the run, fills staging and runs the checks, all in one transaction. `checks` is
   * null for rows without shapes (rainfall): only the verdict is worked out then.
   */
  createCheckedRun(
    run: NewImportRun,
    rows: StagedRows,
    checks: GeometryCheckContext | null,
    /** A flood risk run's map, or a satellite flood run's month, written in the same transaction as the run. */
    layer?: NewFloodRiskLayer | NewSatelliteFloodLayer | null,
  ): Promise<ImportRunDto>;
  findRunById(id: string): Promise<ImportRunDto | null>;
  findRunPage(query: OffsetPageQuery): Promise<{ items: ImportRunDto[]; meta: PageMeta }>;
  findRowPage(runId: string, query: StagingRowQuery): Promise<{ items: StagingRowDto[]; meta: PageMeta }>;
  findRunGeoJson(runId: string, bbox: BBox): Promise<StagingFeatureCollection>;
  /** Copies passed rows into the run's live table and marks the run promoted, in one transaction. */
  promote(runId: string, userId: string): Promise<number>;
}
