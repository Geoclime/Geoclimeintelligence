import { describe, expect, it } from "vitest";
import {
  detectLayerChoiceFromFileName,
  importFormSchema,
  parseLayerChoice,
  toMapLayerUpload,
  toStartImport,
  type ImportFormValues,
} from "./import-form.schema";

const base: ImportFormValues = {
  countryCode: "NGA",
  level: "2",
  sourceId: "20000000-0000-4000-8000-000000000001",
  sheetName: "lga_boundaries",
  headerRow: "2",
  parentMode: "column",
  parentId: "",
  fileType: "xlsx",
  acceptPartial: false,
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

  it("needs a shape column for CSV (WKT, like Excel) but not for a shapefile, whose records carry their shapes", () => {
    const noShape = { ...base, columnMapping: { ...base.columnMapping, geometry_wkt: "" } };
    expect(importFormSchema.safeParse({ ...noShape, fileType: "csv" }).error!.issues.map((issue) => issue.path.join("."))).toEqual([
      "columnMapping.geometry_wkt",
    ]);
    expect(importFormSchema.safeParse({ ...noShape, fileType: "shapefile" }).success).toBe(true);
  });

  it("refuses one file column matched twice", () => {
    const result = importFormSchema.safeParse({ ...base, columnMapping: { ...base.columnMapping, unit_code: "lga_name_standard" } });
    expect(result.success).toBe(false);
  });
});

describe("OpenStreetMap layers", () => {
  it("picks the layer from Geofabrik's file names", () => {
    expect(detectLayerChoiceFromFileName("gis_osm_buildings_a_free_1_rivers.gpkg")).toBe("layer:buildings");
    expect(detectLayerChoiceFromFileName("gis_osm_pois_free_1_rivers.gpkg")).toBe("layer:infrastructure");
    // The whole extract defaults to facilities; Buildings is chosen by hand for the same zip.
    expect(detectLayerChoiceFromFileName("osm-20261027T194914Z-1-001.zip")).toBe("layer:infrastructure");
    expect(parseLayerChoice("layer:buildings")).toBe("buildings");
  });

  it("sends 'load even if rows are missing' only for those layers", () => {
    const zip = new File(["x"], "osm.zip");
    const ticked = { ...base, acceptPartial: true };
    expect(toMapLayerUpload(ticked, zip, "buildings")).toMatchObject({ layer: "buildings", acceptPartial: true });
    expect(toMapLayerUpload(ticked, zip, "infrastructure").acceptPartial).toBe(true);
    expect(toMapLayerUpload(ticked, zip, "roads").acceptPartial).toBeUndefined();
    expect(toMapLayerUpload(base, zip, "buildings").acceptPartial).toBeUndefined();
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

  it("sends no shape column or sheet fields for a shapefile, but keeps the shape column for CSV", () => {
    const zip = new File(["x"], "lgas.zip");
    const shapefile = toStartImport({ ...base, fileType: "shapefile" }, zip, "shapefile");
    expect(shapefile).toMatchObject({ sheetName: undefined, headerRow: undefined });
    expect(shapefile.columnMapping).not.toHaveProperty("geometry_wkt");

    const csv = toStartImport({ ...base, fileType: "csv" }, new File(["x"], "lgas.csv"), "csv");
    expect(csv).toMatchObject({ sheetName: undefined, headerRow: undefined });
    expect(csv.columnMapping.geometry_wkt).toBe("geometry_wkt (EPSG:4326)");
  });
});
