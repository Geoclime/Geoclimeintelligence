import { ValidationError } from "../../../common/errors/app-error";
import {
  ADMIN_UNIT_TEMPLATE_COLUMNS,
  carriesRowShapes,
  RAINFALL_COLUMNS,
  type ColumnMapping,
  type ImportFileType,
  type RainfallColumn,
  type RainfallColumnMapping,
  type TemplateColumn,
} from "./import.types";

/**
 * Headings that usually mean each template column, best first. These cover the template
 * itself and the real Phase 2 files: the lga_boundaries sheet (lga_name_standard, adm2_pcode,
 * state, "geometry_wkt (EPSG:4326)"), the geoBoundaries outline (shapeName, shapeISO) and the
 * GRID3 wards file (wardname, wardcode, lganame).
 */
const SYNONYMS: Record<TemplateColumn, (string | RegExp)[]> = {
  unit_name: ["unit_name", /_name_standard$/, "wardname", "ward_name", "lga_name", "name", "shapename", "admin_name"],
  unit_code: ["unit_code", "wardcode", "ward_code", /^adm\d_pcode$/, "pcode", "shapeiso", "code"],
  parent_code: ["parent_code", "parent", "parent_name", "lganame", "lga_name", "state", "statename", "state_name"],
  geometry_wkt: ["geometry_wkt", /wkt/, "geometry", "geom", "shape"],
};

export interface MappingNeeds {
  fileType: ImportFileType;
  /** Level 1 has no parent column; nor does a run where the admin picked one parent for all rows. */
  needsParentColumn: boolean;
}

/**
 * Rainfall headings, best first, for areas at `level`. These cover CHIRPS exported from Earth
 * Engine (ADM2_PCODE, ADM2_EN, year_month, mean) and the cleaned rainfall sheet (adm2_pcode,
 * lga_name_standard, year_month, mean_rainfall_mm). The level picks the right pcode: the CHIRPS
 * export also has ADM0_PCODE and ADM1_PCODE columns.
 */
function rainfallSynonyms(level: number): Record<RainfallColumn, (string | RegExp)[]> {
  return {
    area_code: ["area_code", "unit_code", `adm${level}_pcode`, "pcode", "code"],
    area_name: ["area_name", "unit_name", /_name_standard$/, `adm${level}_en`, `adm${level}_name`, "lga_name", "name"],
    year_month: ["year_month", "yearmonth", "month", "period", "date"],
    rainfall_mm: ["rainfall_mm", "mean_rainfall_mm", "rainfall", "precipitation_mm", "precipitation", "precip", "mean"],
  };
}

/** Each column's first synonym that matches a heading not already taken. */
function pickHeadings<C extends string>(headings: string[], columns: readonly C[], synonyms: Record<C, (string | RegExp)[]>): Partial<Record<C, string>> {
  const used = new Set<string>();
  const mapping: Partial<Record<C, string>> = {};
  for (const column of columns) {
    for (const synonym of synonyms[column]) {
      const match = headings.find((heading) => {
        if (used.has(heading)) return false;
        const key = heading.trim().toLowerCase();
        return typeof synonym === "string" ? key === synonym : synonym.test(key);
      });
      if (match) {
        mapping[column] = match;
        used.add(match);
        break;
      }
    }
  }
  return mapping;
}

/** A first guess at the mapping, shown on the import screen for the admin to confirm or change. */
export function suggestMapping(headings: string[], needs: MappingNeeds): ColumnMapping {
  const columns = ADMIN_UNIT_TEMPLATE_COLUMNS.filter(
    // GeoJSON features and shapefile records carry their shape themselves, not in a column.
    (column) => !(column === "parent_code" && !needs.needsParentColumn) && !(column === "geometry_wkt" && carriesRowShapes(needs.fileType)),
  );
  return pickHeadings(headings, columns, SYNONYMS);
}

/** The rainfall guess. `level` is the level of the areas the rainfall is for (2 = LGA). */
export function suggestRainfallMapping(headings: string[], level: number): RainfallColumnMapping {
  return pickHeadings(headings, RAINFALL_COLUMNS, rainfallSynonyms(level));
}

type FieldErrors = { field: string; message: string }[];

/** Every mapped heading is in the file, and no heading is used twice. */
function checkHeadings(mapping: Record<string, string | undefined>, headings: string[], errors: FieldErrors): void {
  for (const [column, heading] of Object.entries(mapping)) {
    if (heading && !headings.includes(heading)) {
      errors.push({ field: `columnMapping.${column}`, message: `The file has no column called "${heading}"` });
    }
  }
  const picked = Object.values(mapping).filter(Boolean);
  if (new Set(picked).size !== picked.length) {
    errors.push({ field: "columnMapping", message: "Each file column can be matched to only one template column" });
  }
}

/** Throws a field-level 400 if the mapping is missing a required column or names a heading that isn't in the file. */
export function assertMappingFits(mapping: ColumnMapping, headings: string[], needs: MappingNeeds): void {
  const errors: FieldErrors = [];
  const required: TemplateColumn[] = ["unit_name"];
  if (needs.needsParentColumn) required.push("parent_code");
  if (!carriesRowShapes(needs.fileType)) required.push("geometry_wkt");

  for (const column of required) {
    if (!mapping[column]) errors.push({ field: `columnMapping.${column}`, message: `Choose the column that holds ${column}` });
  }
  checkHeadings(mapping, headings, errors);
  if (errors.length > 0) throw new ValidationError(errors);
}

/** The rainfall version: a month, a value, and the area's code or name (or both). */
export function assertRainfallMappingFits(mapping: RainfallColumnMapping, headings: string[]): void {
  const errors: FieldErrors = [];
  if (!mapping.area_code && !mapping.area_name) {
    errors.push({ field: "columnMapping.area_code", message: "Choose the column with each area's code, or its name" });
  }
  if (!mapping.year_month) errors.push({ field: "columnMapping.year_month", message: "Choose the column that holds the month" });
  if (!mapping.rainfall_mm) errors.push({ field: "columnMapping.rainfall_mm", message: "Choose the column that holds the rainfall (mm)" });
  checkHeadings(mapping, headings, errors);
  if (errors.length > 0) throw new ValidationError(errors);
}
