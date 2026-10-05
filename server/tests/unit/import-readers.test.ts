import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ValidationError } from "../../src/common/errors/app-error";
import { buildAdminUnitTemplateGeoJson, buildAdminUnitTemplateXlsx } from "../../src/modules/data-sources/imports/admin-unit-template";
import { detectFileType } from "../../src/modules/data-sources/imports/readers/read-import-file";
import { readGeoJson } from "../../src/modules/data-sources/imports/readers/geojson-reader";
import { readXlsx } from "../../src/modules/data-sources/imports/readers/xlsx-reader";
import { makeUnit } from "../geo-fakes";

/** The field-level message a reader put on its 400. */
function fileMessage(read: () => unknown): string {
  try {
    read();
  } catch (err) {
    return (err as ValidationError).errors?.[0]?.message ?? "";
  }
  return "(no error)";
}

const WKT = "POLYGON((7 4.8, 7.01 4.8, 7.01 4.81, 7 4.81, 7 4.8))";

async function toBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Laid out like the real lga_boundaries sheet: a merged title banner, headings in row 2. */
async function bannerWorkbook(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("rainfall");
  sheet.addRow(["not this sheet"]);
  const lgas = workbook.addWorksheet("lga_boundaries");
  lgas.addRow(["The LGA boundary polygons -- source: geoBoundaries"]);
  lgas.mergeCells("A1:D1");
  lgas.addRow(["lga_name_standard", "adm2_pcode", "vertex_count", "geometry_wkt (EPSG:4326)"]);
  lgas.addRow(["Obio-Akpor", "NG033015", 120, WKT]);
  lgas.addRow([]);
  lgas.addRow(["Port Harcourt", "NG033022", 88, WKT]);
  return toBuffer(workbook);
}

describe("readXlsx", () => {
  it("finds the heading row under a merged title banner and skips blank rows", async () => {
    const parsed = await readXlsx(await bannerWorkbook(), { sheetName: "lga_boundaries" });
    expect(parsed.headerRow).toBe(2);
    expect(parsed.sheets).toEqual(["rainfall", "lga_boundaries"]);
    expect(parsed.headings).toEqual(["lga_name_standard", "adm2_pcode", "vertex_count", "geometry_wkt (EPSG:4326)"]);
    expect(parsed.rows.map((r) => r.rowNumber)).toEqual([3, 5]);
    expect(parsed.rows[0]!.values).toMatchObject({ lga_name_standard: "Obio-Akpor", vertex_count: "120" });
    expect(parsed.rows[0]!.values["geometry_wkt (EPSG:4326)"]).toBe(WKT);
  });

  it("lets the admin override the heading row", async () => {
    const parsed = await readXlsx(await bannerWorkbook(), { sheetName: "lga_boundaries", headerRow: 3 });
    expect(parsed.headings[0]).toBe("Obio-Akpor");
  });

  it("names the available sheets when the requested one is missing", async () => {
    await expect(readXlsx(await bannerWorkbook(), { sheetName: "wards" })).rejects.toMatchObject({
      errors: [{ field: "sheetName", message: expect.stringContaining("rainfall, lga_boundaries") }],
    });
  });

  it("refuses bytes that aren't a workbook", async () => {
    await expect(readXlsx(Buffer.from("not a zip"))).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("readGeoJson", () => {
  const collection = (extra: object = {}) =>
    Buffer.from(
      JSON.stringify({
        type: "FeatureCollection",
        ...extra,
        features: [
          { type: "Feature", properties: { wardname: "Ikuru", FID: 1 }, geometry: { type: "Polygon", coordinates: [] } },
          { type: "Feature", properties: { wardname: "Omward 5", status: "Invalid" }, geometry: null },
        ],
      }),
    );

  it("turns features into rows, keeping a missing geometry as null for the checks to report", () => {
    const parsed = readGeoJson(collection());
    expect(parsed.headings).toEqual(["wardname", "FID", "status"]);
    expect(parsed.rows[0]).toMatchObject({ rowNumber: 1, values: { wardname: "Ikuru", FID: "1" } });
    expect(parsed.rows[1]!.geometry).toBeNull();
  });

  it("accepts a WGS84 CRS and refuses any other", () => {
    expect(() => readGeoJson(collection({ crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } } }))).not.toThrow();
    expect(() => readGeoJson(collection({ crs: { type: "name", properties: { name: "EPSG:32632" } } }))).toThrow(ValidationError);
    expect(fileMessage(() => readGeoJson(collection({ crs: { type: "name", properties: { name: "EPSG:32632" } } })))).toMatch(/EPSG:32632/);
  });

  it("refuses JSON that isn't a FeatureCollection", () => {
    expect(() => readGeoJson(Buffer.from('{"type":"Polygon"}'))).toThrow(ValidationError);
    expect(fileMessage(() => readGeoJson(Buffer.from("{oops")))).toMatch(/not valid JSON/);
  });
});

describe("detectFileType", () => {
  it("goes by extension, then by content", () => {
    expect(detectFileType({ originalName: "a.geojson", buffer: Buffer.from("") })).toBe("geojson");
    expect(detectFileType({ originalName: "upload", buffer: Buffer.from("PK\u0003\u0004") })).toBe("xlsx");
    expect(detectFileType({ originalName: "upload", buffer: Buffer.from(' {"type":1}') })).toBe("geojson");
    expect(() => detectFileType({ originalName: "rain.csv", buffer: Buffer.from("a,b") })).toThrow(ValidationError);
  });
});

describe("admin-units templates", () => {
  const rivers = makeUnit({ level: 1, levelName: "State", unitName: "Rivers", unitCode: "NG-RI" });
  const context = {
    countryCode: "NGA",
    countryName: "Nigeria",
    level: 2,
    levelName: "LGA",
    parentLevelName: "State",
    parents: [rivers],
  };

  it("has Areas, Parent areas and Instructions sheets, and reads back with the template headings", async () => {
    const template = await buildAdminUnitTemplateXlsx(context);
    expect(template.fileName).toBe("admin-units-template_NGA_level-2-lga.xlsx");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(template.body as unknown as ArrayBuffer);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(["Areas", "Parent areas", "Instructions"]);
    expect(workbook.getWorksheet("Parent areas")!.getRow(2).getCell(3).text).toBe("NG-RI");

    // The example lives on Instructions only, so an untouched template has no data rows.
    workbook.getWorksheet("Areas")!.addRow(["Okrika", "NG033018", "NG-RI", WKT]);
    const parsed = await readXlsx(await toBuffer(workbook));
    expect(parsed.sheetName).toBe("Areas");
    expect(parsed.headings).toEqual(["unit_name", "unit_code", "parent_code", "geometry_wkt"]);
    expect(parsed.rows).toHaveLength(1);
  });

  it("ships the GeoJSON sample with no features, so uploading it unchanged imports nothing", () => {
    const template = buildAdminUnitTemplateGeoJson(context);
    const document = JSON.parse(template.body.toString("utf8"));
    expect(document.features).toEqual([]);
    expect(document.validParents).toEqual([{ unit_name: "Rivers", use_in_parent_code: "NG-RI" }]);
    expect(readGeoJson(template.body).rows).toHaveLength(0);
  });
});
