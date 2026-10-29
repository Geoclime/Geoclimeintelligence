import { z } from "zod";
import {
  RAINFALL_COLUMNS,
  TEMPLATE_COLUMNS,
  type ColumnMapping,
  type ImportFileType,
  type RainfallColumn,
  type RainfallColumnMapping,
  type StartImportInput,
  type StartRainfallImportInput,
  type TemplateColumn,
} from "../../types/import.types";
import type { MapLayerUploadKind, UploadMapLayerInput } from "../../types/map-layer.types";

/**
 * The import screen's form. Field names follow the backend's startImportSchema
 * (server/src/modules/data-sources/imports/import.validation.ts): countryCode, level, sourceId,
 * sheetName, headerRow, parentId and columnMapping.<column>, so a 400's field errors land on the
 * right input. Level values `layer:roads`, `layer:waterways`, `layer:settlements`, `layer:infrastructure`, `layer:buildings` and `layer:zip`
 * select map-layer uploads (`POST /api/v1/map-layers/upload`), which skip column matching.
 * `rainfall:<level>` selects a rainfall import for that level's areas (`POST /api/v1/imports/rainfall`),
 * whose columns are columnMapping.area_code, area_name, year_month and rainfall_mm.
 */

const optionalHeading = z.string().trim();
const rainfallHeading = z.string().trim().optional();

/** "rainfall:2" -> 2 (rainfall per LGA in Nigeria); null for any other choice. */
export function parseRainfallChoice(levelValue: string): number | null {
  const match = /^rainfall:(\d+)$/.exec(levelValue);
  return match ? Number(match[1]) : null;
}

export function parseLayerChoice(levelValue: string): MapLayerUploadKind | null {
  if (levelValue === "layer:roads") return "roads";
  if (levelValue === "layer:waterways") return "waterways";
  if (levelValue === "layer:settlements") return "settlements";
  if (levelValue === "layer:infrastructure") return "infrastructure";
  if (levelValue === "layer:buildings") return "buildings";
  if (levelValue === "layer:zip") return "zip";
  return null;
}

export function detectLayerChoiceFromFileName(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  // CHIRPS exported from Earth Engine is monthly rainfall per LGA (ADM2). Not "rainfall" alone:
  // rivers_state_rainfall_and_boundaries.xlsx is also the Phase 2 LGA boundaries file.
  if (lower.includes("chirps") && /\.(xlsx|csv|tsv)$/.test(lower)) return "rainfall:2";
  if (lower.includes("map_layers") && lower.endsWith(".zip")) return "layer:zip";
  // Geofabrik's extract: a buildings .gpkg, any other gis_osm_*.gpkg, or the zip of them all (osm-...zip,
  // facilities by default: choose Buildings for the same zip).
  if (lower.endsWith(".gpkg") && lower.includes("buildings")) return "layer:buildings";
  // A zip with "osm" in its name: osm-20261027....zip, Rivers_State_OSM_All_Features_....zip.
  if (lower.endsWith(".gpkg") || (/(^|[^a-z])osm([^a-z]|$)/.test(lower) && lower.endsWith(".zip"))) return "layer:infrastructure";
  if (lower.includes("road") && (lower.endsWith(".geojson") || lower.endsWith(".json"))) return "layer:roads";
  if (lower.includes("waterway") && (lower.endsWith(".geojson") || lower.endsWith(".json"))) return "layer:waterways";
  if (lower.includes("settlement") && (lower.endsWith(".geojson") || lower.endsWith(".json"))) return "layer:settlements";
  return null;
}

export const importFormSchema = z
  .object({
    countryCode: z.string().min(1, "Choose a country"),
    level: z.string().min(1, "Choose a level or map layer"),
    sourceId: z.string(),
    sheetName: z.string(),
    headerRow: z.string().regex(/^\d*$/, "A row number, e.g. 2"),
    parentMode: z.enum(["column", "fixed"]),
    parentId: z.string(),
    fileType: z.enum(["xlsx", "geojson", "shapefile", "csv", ""]),
    /** OpenStreetMap layers only: load a cut-short GeoPackage even if rows are missing. */
    acceptPartial: z.boolean(),
    columnMapping: z.object({
      unit_name: optionalHeading,
      unit_code: optionalHeading,
      parent_code: optionalHeading,
      geometry_wkt: optionalHeading,
      area_code: rainfallHeading,
      area_name: rainfallHeading,
      year_month: rainfallHeading,
      rainfall_mm: rainfallHeading,
    }),
  })
  .superRefine((values, ctx) => {
    const layerKind = parseLayerChoice(values.level);
    if (layerKind) {
      if (layerKind !== "zip" && !values.sourceId.trim()) {
        ctx.addIssue({ code: "custom", path: ["sourceId"], message: "Choose the data source these features come from" });
      }
      return;
    }
    if (parseRainfallChoice(values.level) !== null) {
      if (!values.sourceId.trim()) {
        ctx.addIssue({ code: "custom", path: ["sourceId"], message: "Choose the data source this rainfall comes from" });
      }
      const mapping = values.columnMapping;
      if (!mapping.area_code && !mapping.area_name) {
        ctx.addIssue({ code: "custom", path: ["columnMapping", "area_code"], message: "Choose the column with each area's code, or its name" });
      }
      if (!mapping.year_month) ctx.addIssue({ code: "custom", path: ["columnMapping", "year_month"], message: "Choose the column that holds the month" });
      if (!mapping.rainfall_mm) {
        ctx.addIssue({ code: "custom", path: ["columnMapping", "rainfall_mm"], message: "Choose the column that holds the rainfall (mm)" });
      }
      const picked = RAINFALL_COLUMNS.map((column) => mapping[column]).filter(Boolean);
      if (new Set(picked).size !== picked.length) {
        ctx.addIssue({ code: "custom", path: ["columnMapping"], message: "Each file column can be matched to only one template column" });
      }
      return;
    }
    if (!values.sourceId.trim()) {
      ctx.addIssue({ code: "custom", path: ["sourceId"], message: "Choose the data source these areas come from" });
    }
    const level = Number(values.level);
    const need = (column: TemplateColumn, message: string) => {
      if (!values.columnMapping[column]) ctx.addIssue({ code: "custom", path: ["columnMapping", column], message });
    };
    need("unit_name", "Choose the column that holds each area's name");
    if (values.fileType === "xlsx" || values.fileType === "csv") need("geometry_wkt", "Choose the column that holds each area's shape (WKT)");
    if (level > 1 && values.parentMode === "column") {
      need("parent_code", "Choose the column that names each area's parent, or pick one parent for every row above");
    }
    if (level > 1 && values.parentMode === "fixed" && !values.parentId) {
      ctx.addIssue({ code: "custom", path: ["parentId"], message: "Choose the parent every row belongs to" });
    }
    const picked = TEMPLATE_COLUMNS.map((column) => [column, values.columnMapping[column]] as const)
      .filter(([column, heading]) => {
        if (!heading) return false;
        if (column === "parent_code" && (level === 1 || values.parentMode === "fixed")) return false;
        if (column === "geometry_wkt" && carriesRowShapes(values.fileType)) return false;
        return true;
      })
      .map(([, heading]) => heading);
    if (new Set(picked).size !== picked.length) {
      ctx.addIssue({ code: "custom", path: ["columnMapping"], message: "Each file column can be matched to only one template column" });
    }
  });

export type ImportFormValues = z.infer<typeof importFormSchema>;

/** GeoJSON features and shapefile records carry their own shape; Excel and CSV keep it in a WKT column. */
export function carriesRowShapes(fileType: ImportFileType | ""): boolean {
  return fileType === "geojson" || fileType === "shapefile";
}

export const EMPTY_MAPPING: ImportFormValues["columnMapping"] = {
  unit_name: "",
  unit_code: "",
  parent_code: "",
  geometry_wkt: "",
  area_code: "",
  area_name: "",
  year_month: "",
  rainfall_mm: "",
};

/** The suggested mapping from the preview, in the form's shape ("" = not in this file). */
export function mappingToForm(mapping: ColumnMapping & RainfallColumnMapping): ImportFormValues["columnMapping"] {
  return { ...EMPTY_MAPPING, ...mapping };
}

export function toMapLayerUpload(values: ImportFormValues, file: File, layer: MapLayerUploadKind): UploadMapLayerInput {
  return {
    file,
    countryCode: values.countryCode,
    layer,
    sourceId: layer === "zip" ? undefined : values.sourceId || undefined,
    acceptPartial: isOsmLayer(layer) && values.acceptPartial ? true : undefined,
  };
}

/** The layers loaded from Geofabrik's OpenStreetMap extract (GeoPackages), which can arrive cut short. */
export function isOsmLayer(layer: MapLayerUploadKind | null): boolean {
  return layer === "infrastructure" || layer === "buildings";
}

/** Builds the upload. Unmapped columns and the parent column in "one parent" mode are left out. */
export function toStartImport(values: ImportFormValues, file: File, fileType: ImportFileType): StartImportInput {
  const level = Number(values.level);
  const fixedParent = level > 1 && values.parentMode === "fixed";
  const columnMapping: ColumnMapping = {};
  for (const column of TEMPLATE_COLUMNS) {
    const heading = values.columnMapping[column];
    if (!heading) continue;
    if (column === "parent_code" && (level === 1 || fixedParent)) continue;
    if (column === "geometry_wkt" && carriesRowShapes(fileType)) continue;
    columnMapping[column] = heading;
  }
  return {
    file,
    countryCode: values.countryCode,
    level,
    sourceId: values.sourceId,
    sheetName: fileType === "xlsx" && values.sheetName ? values.sheetName : undefined,
    headerRow: fileType === "xlsx" && values.headerRow ? Number(values.headerRow) : undefined,
    parentId: fixedParent ? values.parentId : undefined,
    columnMapping,
  };
}

/** Builds a rainfall upload for the `rainfall:<level>` choice. Only the rainfall columns are sent. */
export function toStartRainfallImport(values: ImportFormValues, file: File, fileType: ImportFileType, level: number): StartRainfallImportInput {
  const columnMapping: RainfallColumnMapping = {};
  for (const column of RAINFALL_COLUMNS as readonly RainfallColumn[]) {
    const heading = values.columnMapping[column];
    if (heading) columnMapping[column] = heading;
  }
  return {
    file,
    countryCode: values.countryCode,
    level,
    sourceId: values.sourceId,
    sheetName: fileType === "xlsx" && values.sheetName ? values.sheetName : undefined,
    headerRow: fileType === "xlsx" && values.headerRow ? Number(values.headerRow) : undefined,
    columnMapping,
  };
}
