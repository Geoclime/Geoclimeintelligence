import ExcelJS from "exceljs";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { AdminUnitService } from "../../src/modules/admin-units/admin-unit.service";
import { CountryService } from "../../src/modules/admin-units/country.service";
import { AuthService } from "../../src/modules/auth/auth.service";
import { DataSourceService } from "../../src/modules/data-sources/data-source.service";
import { ImportService } from "../../src/modules/data-sources/imports/import.service";
import { RainfallService } from "../../src/modules/rainfall/rainfall.service";
import { FakeTokenVerifier, InMemoryUserRepository, makeUser } from "../fakes";
import {
  InMemoryAdminUnitRepository,
  InMemoryCountryRepository,
  InMemoryDataSourceRepository,
  InMemoryRainfallRepository,
  makeCountry,
  makeSource,
  makeUnit,
  RecordingImportRepository,
} from "../geo-fakes";
import { buildDbf, buildShp, buildZip, outerRing, partsRecord, square, WGS84_PRJ } from "../shapefile-fixtures";

// Drives the real Express app (middleware order, role guards, validation, multer, error
// handler) with every repository swapped for an in-memory fake. Spatial SQL is not exercised
// here; it was verified against PostGIS with the real Phase 2 files (docs/data-import.md).

const rivers = makeUnit({ level: 1, levelName: "State", unitName: "Rivers", unitCode: "NG-RI" });
const source = makeSource();
let imports: RecordingImportRepository;
let countries: InMemoryCountryRepository;
let sources: InMemoryDataSourceRepository;

beforeEach(() => {
  const users = new InMemoryUserRepository([
    makeUser({ firebaseUid: "admin-uid", role: "administrator" }),
    makeUser({ firebaseUid: "member-uid" }),
  ]);
  countries = new InMemoryCountryRepository([makeCountry()]);
  const units = new InMemoryAdminUnitRepository([rivers]);
  sources = new InMemoryDataSourceRepository([source]);
  imports = new RecordingImportRepository();

  vi.spyOn(AuthService, "Instance", "get").mockReturnValue(new AuthService(users, new FakeTokenVerifier()));
  vi.spyOn(CountryService, "Instance", "get").mockReturnValue(new CountryService(countries));
  vi.spyOn(AdminUnitService, "Instance", "get").mockReturnValue(new AdminUnitService(units, sources));
  vi.spyOn(DataSourceService, "Instance", "get").mockReturnValue(new DataSourceService(sources));
  vi.spyOn(ImportService, "Instance", "get").mockReturnValue(new ImportService(imports, countries, units, sources, new InMemoryRainfallRepository()));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const app = createApp();
const asAdmin = { Authorization: "Bearer valid:admin-uid" };
const asMember = { Authorization: "Bearer valid:member-uid" };

async function lgaFile(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Areas");
  sheet.addRow(["unit_name", "unit_code", "parent_code", "geometry_wkt"]);
  sheet.addRow(["Okrika", "NG033018", "NG-RI", "POLYGON((7 4.8, 7.01 4.8, 7.01 4.81, 7 4.81, 7 4.8))"]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("countries", () => {
  it("lets any signed-in user list countries with their levels", async () => {
    const res = await request(app).get("/api/v1/countries").set(asMember);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ countryCode: "NGA", levels: [{ name: "State" }, { name: "LGA" }, { name: "Ward" }] });
  });

  it("refuses country writes from non-administrators with 403", async () => {
    const body = { countryCode: "GHA", countryName: "Ghana", levelNames: ["Region"] };
    expect((await request(app).post("/api/v1/countries").set(asMember).send(body)).status).toBe(403);
    expect((await request(app).patch("/api/v1/countries/NGA").set(asMember).send({ countryName: "X" })).status).toBe(403);
  });

  it("creates a country, upper-casing the code, and 409s on a duplicate", async () => {
    const created = await request(app)
      .post("/api/v1/countries")
      .set(asAdmin)
      .send({ countryCode: "gha", countryName: "Ghana", levelNames: ["Region", "District"] });
    expect(created.status).toBe(201);
    expect(created.body.data.countryCode).toBe("GHA");

    const duplicate = await request(app)
      .post("/api/v1/countries")
      .set(asAdmin)
      .send({ countryCode: "NGA", countryName: "Nigeria", levelNames: ["State"] });
    expect(duplicate.status).toBe(409);
  });

  it("deletes an empty country for administrators only", async () => {
    await request(app).post("/api/v1/countries").set(asAdmin).send({ countryCode: "GHA", countryName: "Ghana", levelNames: ["Region"] });
    expect((await request(app).delete("/api/v1/countries/GHA").set(asMember)).status).toBe(403);
    const deleted = await request(app).delete("/api/v1/countries/gha").set(asAdmin);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual({ success: true, data: null, message: "Country deleted" });
    expect((await request(app).get("/api/v1/countries/GHA").set(asAdmin)).status).toBe(404);
  });

  it("clears a level for administrators only, bottom-up", async () => {
    countries.counts = [
      { countryCode: "NGA", level: 2, count: 23 },
      { countryCode: "NGA", level: 3, count: 317 },
    ];
    expect((await request(app).delete("/api/v1/countries/NGA/levels/3/areas").set(asMember)).status).toBe(403);
    expect((await request(app).delete("/api/v1/countries/NGA/levels/2/areas").set(asAdmin)).status).toBe(409);
    const cleared = await request(app).delete("/api/v1/countries/nga/levels/3/areas").set(asAdmin);
    expect(cleared.status).toBe(200);
    expect(cleared.body).toEqual({ success: true, data: { deleted: 317 }, message: "317 Ward areas cleared" });
    expect((await request(app).delete("/api/v1/countries/NGA/levels/9/areas").set(asAdmin)).status).toBe(400);
  });

  it("refuses to delete a country that holds areas", async () => {
    countries.counts = [{ countryCode: "NGA", level: 2, count: 23 }];
    const res = await request(app).delete("/api/v1/countries/NGA").set(asAdmin);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Nigeria has 23 areas (LGA 23), so it can't be deleted");
  });

  it("rejects repeated level names and an inverted bbox with field errors", async () => {
    const res = await request(app)
      .post("/api/v1/countries")
      .set(asAdmin)
      .send({ countryCode: "GHA", countryName: "Ghana", levelNames: ["Region", "region"], bbox: [5, 5, 4, 4] });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["bbox", "levelNames"]);
  });
});

describe("admin units", () => {
  it("refuses a map layer request without a bbox (section 10)", async () => {
    const res = await request(app).get("/api/v1/admin-units/geojson?level=2").set(asMember);
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatchObject({ field: "bbox" });
  });

  it("serves a map layer for a bbox", async () => {
    const res = await request(app).get("/api/v1/admin-units/geojson?level=2&bbox=6.4,4.3,7.6,5.7").set(asMember);
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe("FeatureCollection");
  });

  it("validates locate's coordinates and 404s outside every area", async () => {
    expect((await request(app).get("/api/v1/admin-units/locate?lon=7&lat=95").set(asMember)).status).toBe(400);
    const outside = await request(app).get("/api/v1/admin-units/locate?lon=-0.13&lat=51.5").set(asMember);
    expect(outside.status).toBe(404);
    expect(outside.body.success).toBe(false);
  });

  it("lists areas with no shapes, only a bbox/centroid summary", async () => {
    const res = await request(app).get("/api/v1/admin-units?level=1").set(asMember);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toHaveProperty("bbox");
    expect(res.body.data[0]).not.toHaveProperty("geometry");
    expect(res.body.meta).toEqual({ page: 1, pageSize: 25, total: 1 });
  });

  it("rejects a malformed id", async () => {
    expect((await request(app).get("/api/v1/admin-units/not-a-uuid").set(asMember)).status).toBe(400);
  });
});

describe("imports", () => {
  it("are Administrator-only, including the template download", async () => {
    expect((await request(app).get("/api/v1/imports").set(asMember)).status).toBe(403);
    expect((await request(app).get("/api/v1/imports/templates/admin-units?country=NGA&level=2").set(asMember)).status).toBe(403);
    const upload = await request(app).post("/api/v1/imports").set(asMember).attach("file", await lgaFile(), "lgas.xlsx");
    expect(upload.status).toBe(403);
  });

  it("downloads the Excel template as a file", async () => {
    const res = await request(app)
      .get("/api/v1/imports/templates/admin-units?country=NGA&level=2&format=xlsx")
      .set(asAdmin)
      .buffer(true)
      .parse((response, done) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => done(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("admin-units-template_NGA_level-2-lga.xlsx");
    expect((res.body as Buffer).subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("previews an upload's headings and suggested mapping", async () => {
    const res = await request(app)
      .post("/api/v1/imports/preview")
      .set(asAdmin)
      .field("level", "2")
      .attach("file", await lgaFile(), "lgas.xlsx");
    expect(res.status).toBe(200);
    expect(res.body.data.suggestedMapping).toEqual({
      unit_name: "unit_name",
      unit_code: "unit_code",
      parent_code: "parent_code",
      geometry_wkt: "geometry_wkt",
    });
  });

  it("previews a zipped shapefile and a lone .shp, and says why the lone one has no names", async () => {
    const shp = buildShp(5, [partsRecord(5, [outerRing(square(7, 4.8, 0.05))])]);
    const dbf = buildDbf([{ name: "lga_name", type: "C", length: 20 }], [["Okrika"]]);

    const zipped = await request(app)
      .post("/api/v1/imports/preview")
      .set(asAdmin)
      .field("level", "2")
      .attach("file", buildZip({ "lgas.shp": shp, "lgas.dbf": dbf, "lgas.prj": WGS84_PRJ }), "lgas.zip");
    expect(zipped.status).toBe(200);
    expect(zipped.body.data).toMatchObject({ fileType: "shapefile", headings: ["lga_name"], rowCount: 1, warnings: [] });
    expect(zipped.body.data.suggestedMapping).toEqual({ unit_name: "lga_name" });

    const lone = await request(app).post("/api/v1/imports/preview").set(asAdmin).attach("file", shp, "Rivers_State_LGA.shp");
    expect(lone.status).toBe(200);
    expect(lone.body.data.headings).toEqual([]);
    expect(lone.body.data.warnings.join(" ")).toMatch(/No \.dbf attribute table/);

    const index = await request(app).post("/api/v1/imports/preview").set(asAdmin).attach("file", Buffer.alloc(108), "Rivers_State_LGA.shx");
    expect(index.status).toBe(400);
    expect(index.body.errors[0].message).toMatch(/only one part of a shapefile/);
  });

  it("starts a run from a multipart upload", async () => {
    const res = await request(app)
      .post("/api/v1/imports")
      .set(asAdmin)
      .field("countryCode", "NGA")
      .field("level", "2")
      .field("sourceId", source.id)
      .field("columnMapping", JSON.stringify({ unit_name: "unit_name", parent_code: "parent_code", geometry_wkt: "geometry_wkt" }))
      .attach("file", await lgaFile(), "lgas.xlsx");
    expect(res.status).toBe(201);
    expect(imports.created!.rows[0]!.fields).toMatchObject({ unitName: "Okrika", parentId: rivers.id });
  });

  it("explains a missing file, a bad file and bad mapping JSON with 400s", async () => {
    const fields = { countryCode: "NGA", level: "2", sourceId: source.id, columnMapping: "{}" };
    const noFile = await request(app).post("/api/v1/imports").set(asAdmin).field(fields);
    expect(noFile.status).toBe(400);
    expect(noFile.body.errors).toEqual([{ field: "file", message: "Choose a file to upload" }]);

    const badFile = await request(app).post("/api/v1/imports").set(asAdmin).field(fields).attach("file", Buffer.from("<kml/>"), "boundary.kml");
    expect(badFile.status).toBe(400);
    expect(badFile.body.errors[0].field).toBe("file");

    const badJson = await request(app)
      .post("/api/v1/imports")
      .set(asAdmin)
      .field({ ...fields, columnMapping: "{not json" })
      .attach("file", await lgaFile(), "lgas.xlsx");
    expect(badJson.status).toBe(400);
    expect(badJson.body.errors[0].field).toBe("columnMapping");
  });

  it("returns 422 when the data source doesn't exist", async () => {
    const res = await request(app)
      .post("/api/v1/imports")
      .set(asAdmin)
      .field("countryCode", "NGA")
      .field("level", "2")
      .field("sourceId", "99999999-9999-4999-8999-999999999999")
      .field("columnMapping", "{}")
      .attach("file", await lgaFile(), "lgas.xlsx");
    expect(res.status).toBe(422);
  });

  it("404s an unknown run", async () => {
    const res = await request(app).get("/api/v1/imports/99999999-9999-4999-8999-999999999999").set(asAdmin);
    expect(res.status).toBe(404);
  });
});

describe("rainfall imports", () => {
  const emohua = makeUnit({ unitName: "Emohua", unitCode: "NG033010", parentId: rivers.id });
  const mapping = { area_code: "ADM2_PCODE", area_name: "ADM2_EN", year_month: "year_month", rainfall_mm: "mean" };

  beforeEach(() => {
    const units = new InMemoryAdminUnitRepository([rivers, emohua]);
    vi.spyOn(ImportService, "Instance", "get").mockReturnValue(
      new ImportService(imports, countries, units, sources, new InMemoryRainfallRepository()),
    );
  });

  function chirpsCsv(): Buffer {
    return Buffer.from("ADM2_EN,ADM2_PCODE,year_month,mean\nEmohua,NG033010,2016-01,15.719154818319\nEmohua,NG033010,2026-09,\n");
  }

  const upload = (headers: Record<string, string>, columnMapping: object = mapping) =>
    request(app)
      .post("/api/v1/imports/rainfall")
      .set(headers)
      .field({ countryCode: "NGA", level: "2", sourceId: source.id, columnMapping: JSON.stringify(columnMapping) })
      .attach("file", chirpsCsv(), "CHIRPS_rain_csv_Rivers_2016_2026_combined.csv");

  it("are Administrator-only", async () => {
    expect((await upload(asMember)).status).toBe(403);
  });

  it("preview guesses the rainfall columns when asked for rainfall", async () => {
    const res = await request(app)
      .post("/api/v1/imports/preview")
      .set(asAdmin)
      .field({ level: "2", target: "rainfall_observations" })
      .attach("file", chirpsCsv(), "chirps.csv");
    expect(res.status).toBe(200);
    expect(res.body.data.suggestedMapping).toEqual(mapping);
  });

  it("starts a rainfall run from a CSV upload", async () => {
    const res = await upload(asAdmin);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ target: "rainfall_observations", rowCount: 2, passedCount: 2 });
    expect(imports.createdRainfall!.rows.map((r) => [r.fields.yearMonth, r.fields.rainfallMm])).toEqual([
      ["2016-01", 15.719],
      ["2026-09", null],
    ]);
  });

  it("refuses an areas-only mapping key with a 400", async () => {
    const res = await upload(asAdmin, { ...mapping, unit_name: "ADM2_EN" });
    expect(res.status).toBe(400);
  });
});

describe("rainfall reads", () => {
  const emohua = makeUnit({ unitName: "Emohua", unitCode: "NG033010", parentId: rivers.id });

  beforeEach(() => {
    const series = new Map([[emohua.id, [{ yearMonth: "2026-08", rainfallMm: 304.5, dataType: "OBSERVED" as const, sourceId: source.id }]]]);
    vi.spyOn(RainfallService, "Instance", "get").mockReturnValue(
      new RainfallService(new InMemoryRainfallRepository([], series), new InMemoryAdminUnitRepository([rivers, emohua]), sources),
    );
  });

  it("serves an area's monthly series to any signed-in user", async () => {
    const res = await request(app).get("/api/v1/rainfall").query({ adminUnitId: emohua.id }).set(asMember);
    expect(res.status).toBe(200);
    expect(res.body.data.months).toEqual([{ yearMonth: "2026-08", rainfallMm: 304.5 }]);
    expect(res.body.data.sources[0].id).toBe(source.id);
  });

  it("validates the area id and the month range, and needs a signed-in user", async () => {
    expect((await request(app).get("/api/v1/rainfall").query({ adminUnitId: "nope" }).set(asMember)).status).toBe(400);
    const backwards = await request(app).get("/api/v1/rainfall").query({ adminUnitId: emohua.id, from: "2026-09", to: "2026-01" }).set(asMember);
    expect(backwards.status).toBe(400);
    expect((await request(app).get("/api/v1/rainfall").query({ adminUnitId: emohua.id })).status).toBe(401);
  });
});

describe("data sources", () => {
  it("lets anyone read sources but only administrators add one", async () => {
    expect((await request(app).get("/api/v1/data-sources").set(asMember)).status).toBe(200);
    const body = { provider: "GRID3", datasetName: "Wards", url: "https://data.grid3.org", license: "CC BY 4.0", downloadedOn: "2026-09-22" };
    expect((await request(app).post("/api/v1/data-sources").set(asMember).send(body)).status).toBe(403);
    expect((await request(app).post("/api/v1/data-sources").set(asAdmin).send(body)).status).toBe(201);
  });

  it("rejects a non-web link and a future download date", async () => {
    const res = await request(app)
      .post("/api/v1/data-sources")
      .set(asAdmin)
      .send({ provider: "X", datasetName: "Y", url: "ftp://example.com", license: "CC BY 4.0", downloadedOn: "2999-01-01" });
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["downloadedOn", "url"]);
  });

  it("lets only administrators delete a source nothing uses", async () => {
    const unused = await sources.create({
      provider: "Na",
      datasetName: "Na",
      url: "https://example.com",
      license: "CC BY 4.0",
      downloadedOn: "2026-09-22",
      notes: null,
      createdBy: "admin",
    });

    expect((await request(app).delete(`/api/v1/data-sources/${unused.id}`).set(asMember)).status).toBe(403);
    expect((await request(app).delete(`/api/v1/data-sources/${unused.id}`).set(asAdmin)).status).toBe(200);
    expect(sources.rows.map((s) => s.id)).toEqual([source.id]);
  });

  it("refuses to delete a source that areas or layers still point at", async () => {
    sources.inUse.add(source.id);
    const res = await request(app).delete(`/api/v1/data-sources/${source.id}`).set(asAdmin);
    expect(res.status).toBe(409);
    expect(sources.rows).toHaveLength(1);
  });

  it("404s an unknown source and 400s a malformed id", async () => {
    expect((await request(app).delete("/api/v1/data-sources/99999999-9999-4999-8999-999999999999").set(asAdmin)).status).toBe(404);
    expect((await request(app).delete("/api/v1/data-sources/not-a-uuid").set(asAdmin)).status).toBe(400);
  });
});
