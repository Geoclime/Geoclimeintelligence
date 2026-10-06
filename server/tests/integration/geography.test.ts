import ExcelJS from "exceljs";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { AdminUnitService } from "../../src/modules/admin-units/admin-unit.service";
import { CountryService } from "../../src/modules/admin-units/country.service";
import { AuthService } from "../../src/modules/auth/auth.service";
import { DataSourceService } from "../../src/modules/data-sources/data-source.service";
import { ImportService } from "../../src/modules/data-sources/imports/import.service";
import { FakeTokenVerifier, InMemoryUserRepository, makeUser } from "../fakes";
import {
  InMemoryAdminUnitRepository,
  InMemoryCountryRepository,
  InMemoryDataSourceRepository,
  makeCountry,
  makeSource,
  makeUnit,
  RecordingImportRepository,
} from "../geo-fakes";

// Drives the real Express app (middleware order, role guards, validation, multer, error
// handler) with every repository swapped for an in-memory fake. Spatial SQL is not exercised
// here; it was verified against PostGIS with the real Phase 2 files (docs/data-import.md).

const rivers = makeUnit({ level: 1, levelName: "State", unitName: "Rivers", unitCode: "NG-RI" });
const source = makeSource();
let imports: RecordingImportRepository;
let countries: InMemoryCountryRepository;

beforeEach(() => {
  const users = new InMemoryUserRepository([
    makeUser({ firebaseUid: "admin-uid", role: "administrator" }),
    makeUser({ firebaseUid: "member-uid" }),
  ]);
  countries = new InMemoryCountryRepository([makeCountry()]);
  const units = new InMemoryAdminUnitRepository([rivers]);
  const sources = new InMemoryDataSourceRepository([source]);
  imports = new RecordingImportRepository();

  vi.spyOn(AuthService, "Instance", "get").mockReturnValue(new AuthService(users, new FakeTokenVerifier()));
  vi.spyOn(CountryService, "Instance", "get").mockReturnValue(new CountryService(countries));
  vi.spyOn(AdminUnitService, "Instance", "get").mockReturnValue(new AdminUnitService(units, sources));
  vi.spyOn(DataSourceService, "Instance", "get").mockReturnValue(new DataSourceService(sources));
  vi.spyOn(ImportService, "Instance", "get").mockReturnValue(new ImportService(imports, countries, units, sources));
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

    const badFile = await request(app).post("/api/v1/imports").set(asAdmin).field(fields).attach("file", Buffer.from("a,b\n1,2"), "rain.csv");
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
});
