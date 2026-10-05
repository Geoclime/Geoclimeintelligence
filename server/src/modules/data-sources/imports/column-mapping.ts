import { ValidationError } from "../../../common/errors/app-error";
import { ADMIN_UNIT_TEMPLATE_COLUMNS, type ColumnMapping, type ImportFileType, type TemplateColumn } from "./import.types";

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

/** A first guess at the mapping, shown on the import screen for the admin to confirm or change. */
export function suggestMapping(headings: string[], needs: MappingNeeds): ColumnMapping {
  const used = new Set<string>();
  const mapping: ColumnMapping = {};
  for (const column of ADMIN_UNIT_TEMPLATE_COLUMNS) {
    if (column === "parent_code" && !needs.needsParentColumn) continue;
    // GeoJSON carries the shape in each feature, not in a column.
    if (column === "geometry_wkt" && needs.fileType === "geojson") continue;
    for (const synonym of SYNONYMS[column]) {
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

/** Throws a field-level 400 if the mapping is missing a required column or names a heading that isn't in the file. */
export function assertMappingFits(mapping: ColumnMapping, headings: string[], needs: MappingNeeds): void {
  const errors: { field: string; message: string }[] = [];
  const required: TemplateColumn[] = ["unit_name"];
  if (needs.needsParentColumn) required.push("parent_code");
  if (needs.fileType === "xlsx") required.push("geometry_wkt");

  for (const column of required) {
    if (!mapping[column]) errors.push({ field: `columnMapping.${column}`, message: `Choose the column that holds ${column}` });
  }
  for (const [column, heading] of Object.entries(mapping)) {
    if (heading && !headings.includes(heading)) {
      errors.push({ field: `columnMapping.${column}`, message: `The file has no column called "${heading}"` });
    }
  }
  const picked = Object.values(mapping).filter(Boolean);
  if (new Set(picked).size !== picked.length) {
    errors.push({ field: "columnMapping", message: "Each file column can be matched to only one template column" });
  }
  if (errors.length > 0) throw new ValidationError(errors);
}
