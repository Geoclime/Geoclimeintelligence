import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, UnprovenDataError, ValidationError } from "../../src/common/errors/app-error";
import { ImportService } from "../../src/modules/data-sources/imports/import.service";
import { asAuthUser, makeUser } from "../fakes";
import { buildDbf, buildShp, buildZip, outerRing, partsRecord, square, WGS84_PRJ } from "../shapefile-fixtures";
import {
  InMemoryAdminUnitRepository,
  InMemoryCountryRepository,
  InMemoryDataSourceRepository,
  makeCountry,
  makeRunDto,
  makeSource,
  makeUnit,
  NIGERIA_BBOX,
  RecordingImportRepository,
} from "../geo-fakes";

const WKT = "POLYGON((7 4.8, 7.01 4.8, 7.01 4.81, 7 4.81, 7 4.8))";
const admin = asAuthUser(makeUser({ role: "administrator" }));
const source = makeSource();
const rivers = makeUnit({ level: 1, levelName: "State", unitName: "Rivers", unitCode: "NG-RI" });

async function lgaWorkbook(rows: (string | null)[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Areas");
  sheet.addRow(["unit_name", "unit_code", "parent_code", "geometry_wkt"]);
  for (const row of rows) sheet.addRow(row);
  return { originalName: "lgas.xlsx", buffer: Buffer.from(await workbook.xlsx.writeBuffer()) };
}

const mapping = { unit_name: "unit_name", unit_code: "unit_code", parent_code: "parent_code", geometry_wkt: "geometry_wkt" };
const startInput = { countryCode: "NGA", level: 2, sourceId: source.id, columnMapping: mapping };

function setup({ units = [rivers], country = makeCountry() } = {}) {
  const imports = new RecordingImportRepository();
  const service = new ImportService(
    imports,
    new InMemoryCountryRepository([country]),
    new InMemoryAdminUnitRepository(units),
    new InMemoryDataSourceRepository([source]),
  );
  return { imports, service };
}

describe("ImportService.preview", () => {
  it("returns headings, a few short sample rows and a suggested mapping, storing nothing", async () => {
    const { imports, service } = setup();
    const preview = await service.preview(await lgaWorkbook([["Okrika", "NG033018", "NG-RI", WKT]]), { level: 2 });
    expect(preview).toMatchObject({ fileType: "xlsx", sheetName: "Areas", headerRow: 1, rowCount: 1, suggestedMapping: mapping });
    expect(imports.created).toBeUndefined();
  });
});

describe("ImportService.start", () => {
  it("stages every row with the country's bbox for the database checks", async () => {
    const { imports, service } = setup();
    const run = await service.start(await lgaWorkbook([["Okrika", "NG033018", "NG-RI", WKT], ["Bonny", null, "Rivers", WKT]]), startInput, admin);
    expect(run.rowCount).toBe(2);
    expect(imports.created!.checks).toEqual({ countryCode: "NGA", bbox: NIGERIA_BBOX });
    expect(imports.created!.run).toMatchObject({
      target: "admin_units",
      options: { countryCode: "NGA", level: 2, levelName: "LGA", parentId: null },
      sourceId: source.id,
      createdBy: admin.id,
      warnings: [],
    });
    expect(imports.created!.rows.map((r) => r.fields.parentId)).toEqual([rivers.id, rivers.id]);
  });

  it("warns on the run when the country has no rough bounding box", async () => {
    const { imports, service } = setup({ country: makeCountry({ bbox: null }) });
    await service.start(await lgaWorkbook([["Okrika", null, "NG-RI", WKT]]), startInput, admin);
    expect(imports.created!.checks.bbox).toBeNull();
    expect(imports.created!.run.warnings[0]).toMatch(/no rough bounding box/);
  });

  it("refuses an upload whose data source doesn't exist (422)", async () => {
    const { service } = setup();
    await expect(
      service.start(await lgaWorkbook([["Okrika", null, "NG-RI", WKT]]), { ...startInput, sourceId: "99999999-9999-4999-8999-999999999999" }, admin),
    ).rejects.toBeInstanceOf(UnprovenDataError);
  });

  it("refuses an unknown country, a level the country doesn't have, or a level whose parents aren't loaded", async () => {
    const file = await lgaWorkbook([["Okrika", null, "NG-RI", WKT]]);
    await expect(setup().service.start(file, { ...startInput, countryCode: "GHA" }, admin)).rejects.toBeInstanceOf(ValidationError);
    await expect(setup().service.start(file, { ...startInput, level: 5 }, admin)).rejects.toMatchObject({
      errors: [{ field: "level", message: "Nigeria has 3 levels (State, LGA, Ward)" }],
    });
    await expect(setup({ units: [] }).service.start(file, startInput, admin)).rejects.toMatchObject({
      errors: [{ field: "level", message: "No State areas are live yet. Import and promote those first." }],
    });
  });

  it("lets the admin choose one parent for every row instead of a parent column", async () => {
    const { imports, service } = setup();
    const { parent_code: _unused, ...withoutParent } = mapping;
    await service.start(
      await lgaWorkbook([["Okrika", null, null, WKT]]),
      { ...startInput, parentId: rivers.id, columnMapping: withoutParent },
      admin,
    );
    expect(imports.created!.rows[0]!.fields.parentId).toBe(rivers.id);
    expect(imports.created!.run.options.parentId).toBe(rivers.id);
  });

  it("refuses an empty file", async () => {
    await expect(setup().service.start(await lgaWorkbook([]), startInput, admin)).rejects.toMatchObject({
      errors: [{ field: "file" }],
    });
  });
});

describe("ImportService with shapefiles and CSV", () => {
  const shp = buildShp(5, [partsRecord(5, [outerRing(square(7, 4.8, 0.05))]), partsRecord(5, [outerRing(square(7.2, 4.8, 0.05))])]);
  const dbf = buildDbf(
    [{ name: "lga_name", type: "C", length: 20 }, { name: "lga_code", type: "C", length: 10 }],
    [["Okrika", "NG033018"], ["Bonny", "NG033003"]],
  );
  const fixedParent = { ...startInput, parentId: rivers.id, columnMapping: { unit_name: "lga_name", unit_code: "lga_code" } };

  it("stages a zipped shapefile's shapes as GeoJSON beside the .dbf's names, with no shape column to map", async () => {
    const { imports, service } = setup();
    const zip = { originalName: "lgas.zip", buffer: buildZip({ "lgas.shp": shp, "lgas.dbf": dbf, "lgas.prj": WGS84_PRJ }) };
    const run = await service.start(zip, fixedParent, admin);
    expect(run.rowCount).toBe(2);
    expect(imports.created!.run).toMatchObject({ fileType: "shapefile", sheetName: null, warnings: [] });
    expect(imports.created!.rows.map((r) => [r.fields.unitName, r.geomFormat])).toEqual([
      ["Okrika", "geojson"],
      ["Bonny", "geojson"],
    ]);
    expect(JSON.parse(imports.created!.rows[0]!.geomSource!)).toMatchObject({ type: "Polygon" });
  });

  it("passes the reader's warnings to the run, so an assumed coordinate system is on record", async () => {
    const { imports, service } = setup();
    const withoutPrj = { originalName: "lgas.zip", buffer: buildZip({ "lgas.shp": shp, "lgas.dbf": dbf }) };
    await service.start(withoutPrj, fixedParent, admin);
    expect(imports.created!.run.warnings).toHaveLength(1);
    expect(imports.created!.run.warnings[0]).toMatch(/No coordinate system \(\.prj\).*assumed to be WGS84/);
  });

  it("previews a bare .shp with its warnings, and won't start a run from it because it has no names", async () => {
    const { imports, service } = setup();
    const bare = { originalName: "Rivers_State_LGA.shp", buffer: shp };
    const preview = await service.preview(bare, { level: 2 });
    expect(preview).toMatchObject({ fileType: "shapefile", headings: [], rowCount: 2, suggestedMapping: {} });
    expect(preview.warnings).toHaveLength(2);

    await expect(service.start(bare, fixedParent, admin)).rejects.toMatchObject({
      errors: [{ field: "file", message: expect.stringContaining("no attribute columns") }],
    });
    expect(imports.created).toBeUndefined();
  });

  it("reads a CSV whose shape column holds WKT, the same as an Excel sheet", async () => {
    const { imports, service } = setup();
    const csv = {
      originalName: "lgas.csv",
      buffer: Buffer.from(`unit_name,unit_code,parent_code,geometry_wkt\nOkrika,NG033018,NG-RI,"${WKT}"\n`),
    };
    await service.start(csv, startInput, admin);
    expect(imports.created!.run.fileType).toBe("csv");
    expect(imports.created!.rows[0]).toMatchObject({ geomSource: WKT, geomFormat: "wkt", fields: { unitName: "Okrika", parentId: rivers.id } });
  });
});

describe("ImportService.promote", () => {
  it("promotes a checked run and returns it marked promoted", async () => {
    const { imports, service } = setup();
    imports.runs.set("r1", makeRunDto({ id: "r1", rowCount: 23, passedCount: 23 }));
    await expect(service.promote("r1", admin)).resolves.toMatchObject({ status: "promoted", promotedCount: 23 });
  });

  it("refuses a second promote, a run with nothing passed, or an unknown run", async () => {
    const { imports, service } = setup();
    imports.runs.set("done", makeRunDto({ id: "done", status: "promoted", passedCount: 23 }));
    imports.runs.set("empty", makeRunDto({ id: "empty", rowCount: 2, passedCount: 0, errorCount: 2 }));
    await expect(service.promote("done", admin)).rejects.toBeInstanceOf(ConflictError);
    await expect(service.promote("empty", admin)).rejects.toBeInstanceOf(ConflictError);
    await expect(service.promote("nope", admin)).rejects.toBeInstanceOf(NotFoundError);
    expect(imports.promoteCalls).toBe(0);
  });
});

describe("ImportService.template", () => {
  it("builds the Excel template for a level, listing that level's valid parents", async () => {
    const file = await setup().service.template({ country: "NGA", level: 2, format: "xlsx" });
    expect(file.contentType).toContain("spreadsheetml");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.body as unknown as ArrayBuffer);
    expect(workbook.getWorksheet("Parent areas")!.getRow(2).getCell(1).text).toBe("Rivers");
  });

  it("builds the GeoJSON sample", async () => {
    const file = await setup().service.template({ country: "NGA", level: 1, format: "geojson" });
    expect(file.fileName).toBe("admin-units-template_NGA_level-1-state.geojson");
  });
});
