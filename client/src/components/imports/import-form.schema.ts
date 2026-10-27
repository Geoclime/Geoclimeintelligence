import { z } from "zod";
import type { ColumnMapping, ImportFileType, StartImportInput, TemplateColumn } from "../../types/import.types";
import type { MapLayerUploadKind, UploadMapLayerInput } from "../../types/map-layer.types";

/**
 * The import screen's form. Field names follow the backend's startImportSchema
 * (server/src/modules/data-sources/imports/import.validation.ts): countryCode, level, sourceId,
 * sheetName, headerRow, parentId and columnMapping.<column>, so a 400's field errors land on the
 * right input. Level values `layer:roads`, `layer:waterways`, `layer:settlements` and `layer:zip`
 * select map-layer uploads (`POST /api/v1/map-layers/upload`), which skip column matching.
 */

const optionalHeading = z.string().trim();

export function parseLayerChoice(levelValue: string): MapLayerUploadKind | null {
  if (levelValue === "layer:roads") return "roads";
  if (levelValue === "layer:waterways") return "waterways";
  if (levelValue === "layer:settlements") return "settlements";
  if (levelValue === "layer:zip") return "zip";
  return null;
}

export function detectLayerChoiceFromFileName(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.includes("map_layers") && lower.endsWith(".zip")) return "layer:zip";
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
    columnMapping: z.object({
      unit_name: optionalHeading,
      unit_code: optionalHeading,
      parent_code: optionalHeading,
      geometry_wkt: optionalHeading,
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
    const picked = Object.entries(values.columnMapping)
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

export const EMPTY_MAPPING: ImportFormValues["columnMapping"] = { unit_name: "", unit_code: "", parent_code: "", geometry_wkt: "" };

/** The suggested mapping from the preview, in the form's shape ("" = not in this file). */
export function mappingToForm(mapping: ColumnMapping): ImportFormValues["columnMapping"] {
  return { ...EMPTY_MAPPING, ...mapping };
}

export function toMapLayerUpload(values: ImportFormValues, file: File, layer: MapLayerUploadKind): UploadMapLayerInput {
  return {
    file,
    countryCode: values.countryCode,
    layer,
    sourceId: layer === "zip" ? undefined : values.sourceId || undefined,
  };
}

/** Builds the upload. Unmapped columns and the parent column in "one parent" mode are left out. */
export function toStartImport(values: ImportFormValues, file: File, fileType: ImportFileType): StartImportInput {
  const level = Number(values.level);
  const fixedParent = level > 1 && values.parentMode === "fixed";
  const columnMapping: ColumnMapping = {};
  for (const [column, heading] of Object.entries(values.columnMapping) as [TemplateColumn, string][]) {
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
