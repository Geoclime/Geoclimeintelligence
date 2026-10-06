import { describe, expect, it } from "vitest";
import { importFormSchema, toStartImport, type ImportFormValues } from "./import-form.schema";

const base: ImportFormValues = {
  countryCode: "NGA",
  level: "2",
  sourceId: "20000000-0000-4000-8000-000000000001",
  sheetName: "lga_boundaries",
  headerRow: "2",
  parentMode: "column",
  parentId: "",
  fileType: "xlsx",
  columnMapping: { unit_name: "lga_name_standard", unit_code: "adm2_pcode", parent_code: "state", geometry_wkt: "geometry_wkt (EPSG:4326)" },
};
const file = new File(["x"], "rivers_state_rainfall_and_boundaries.xlsx");

describe("importFormSchema", () => {
  it("accepts the real LGA sheet's mapping", () => {
    expect(importFormSchema.safeParse(base).success).toBe(true);
  });

  it("needs a shape column for Excel, a parent column (or one parent) below level 1", () => {
    const result = importFormSchema.safeParse({ ...base, columnMapping: { ...base.columnMapping, parent_code: "", geometry_wkt: "" } });
    expect(result.error!.issues.map((issue) => issue.path.join("."))).toEqual(["columnMapping.geometry_wkt", "columnMapping.parent_code"]);
    expect(importFormSchema.safeParse({ ...base, parentMode: "fixed", parentId: "" }).error!.issues[0]!.path).toEqual(["parentId"]);
  });

  it("refuses one file column matched twice", () => {
    const result = importFormSchema.safeParse({ ...base, columnMapping: { ...base.columnMapping, unit_code: "lga_name_standard" } });
    expect(result.success).toBe(false);
  });
});

describe("toStartImport", () => {
  it("sends the sheet, heading row and mapping for Excel", () => {
    expect(toStartImport(base, file, "xlsx")).toMatchObject({
      level: 2,
      sheetName: "lga_boundaries",
      headerRow: 2,
      parentId: undefined,
      columnMapping: base.columnMapping,
    });
  });

  it("drops the parent column when one parent is chosen, and Excel-only fields for GeoJSON", () => {
    const input = toStartImport(
      { ...base, parentMode: "fixed", parentId: "p1", fileType: "geojson" },
      new File(["{}"], "wards.geojson"),
      "geojson",
    );
    expect(input).toMatchObject({ parentId: "p1", sheetName: undefined, headerRow: undefined });
    expect(input.columnMapping).toEqual({ unit_name: "lga_name_standard", unit_code: "adm2_pcode" });
  });
});
