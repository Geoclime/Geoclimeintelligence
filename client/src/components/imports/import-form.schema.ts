import { z } from "zod";
import type { ColumnMapping, ImportFileType, StartImportInput, TemplateColumn } from "../../types/import.types";

/**
 * The import screen's form. Field names follow the backend's startImportSchema
 * (server/src/modules/data-sources/imports/import.validation.ts): countryCode, level, sourceId,
 * sheetName, headerRow, parentId and columnMapping.<column>, so a 400's field errors land on the
 * right input. The file itself lives outside the form (a File can't be a form default).
 */

const optionalHeading = z.string().trim();

export const importFormSchema = z
  .object({
    countryCode: z.string().min(1, "Choose a country"),
    level: z.string().min(1, "Choose a level"),
    sourceId: z.string().min(1, "Choose the data source these areas come from"),
    sheetName: z.string(),
    headerRow: z.string().regex(/^\d*$/, "A row number, e.g. 2"),
    parentMode: z.enum(["column", "fixed"]),
    parentId: z.string(),
    fileType: z.enum(["xlsx", "geojson", ""]),
    columnMapping: z.object({
      unit_name: optionalHeading,
      unit_code: optionalHeading,
      parent_code: optionalHeading,
      geometry_wkt: optionalHeading,
    }),
  })
  .superRefine((values, ctx) => {
    const level = Number(values.level);
    const need = (column: TemplateColumn, message: string) => {
      if (!values.columnMapping[column]) ctx.addIssue({ code: "custom", path: ["columnMapping", column], message });
    };
    need("unit_name", "Choose the column that holds each area's name");
    if (values.fileType === "xlsx") need("geometry_wkt", "Choose the column that holds each area's shape (WKT)");
    if (level > 1 && values.parentMode === "column") need("parent_code", "Choose the column that names each area's parent");
    if (level > 1 && values.parentMode === "fixed" && !values.parentId) {
      ctx.addIssue({ code: "custom", path: ["parentId"], message: "Choose the parent every row belongs to" });
    }
    const picked = Object.values(values.columnMapping).filter(Boolean);
    if (new Set(picked).size !== picked.length) {
      ctx.addIssue({ code: "custom", path: ["columnMapping"], message: "Each file column can be matched to only one template column" });
    }
  });

export type ImportFormValues = z.infer<typeof importFormSchema>;

export const EMPTY_MAPPING: ImportFormValues["columnMapping"] = { unit_name: "", unit_code: "", parent_code: "", geometry_wkt: "" };

/** The suggested mapping from the preview, in the form's shape ("" = not in this file). */
export function mappingToForm(mapping: ColumnMapping): ImportFormValues["columnMapping"] {
  return { ...EMPTY_MAPPING, ...mapping };
}

/** Builds the upload. Unmapped columns and the parent column in "one parent" mode are left out. */
export function toStartImport(values: ImportFormValues, file: File, fileType: ImportFileType): StartImportInput {
  const level = Number(values.level);
  const fixedParent = level > 1 && values.parentMode === "fixed";
  const columnMapping: ColumnMapping = {};
  for (const [column, heading] of Object.entries(values.columnMapping) as [TemplateColumn, string][]) {
    if (!heading) continue;
    if (column === "parent_code" && (level === 1 || fixedParent)) continue;
    if (column === "geometry_wkt" && fileType === "geojson") continue;
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
