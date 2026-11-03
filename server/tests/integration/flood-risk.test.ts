import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { AuthService } from "../../src/modules/auth/auth.service";
import { FloodRiskService } from "../../src/modules/flood-risk/flood-risk.service";
import { FakeTokenVerifier, InMemoryUserRepository, makeUser } from "../fakes";
import { InMemoryFloodRiskRepository, RecordingFloodRiskImports, cellRectangle, makeArea, makeLayerRecord, ORIGIN } from "../flood-risk-fakes";
import { InMemoryAdminUnitRepository, InMemoryCountryRepository, InMemoryDataSourceRepository, makeCountry, makeSource } from "../geo-fakes";
import { buildClassTiff } from "../raster-fixtures";

// Drives the real Express app (middleware order, role guards, validation, multer, error handler)
// with every repository swapped for an in-memory fake. The SQL is not exercised here.

const source = makeSource();
let layers: InMemoryFloodRiskRepository;
let imports: RecordingFloodRiskImports;

beforeEach(() => {
  const users = new InMemoryUserRepository([
    makeUser({ firebaseUid: "admin-uid", role: "administrator" }),
    makeUser({ firebaseUid: "member-uid" }),
  ]);
  layers = new InMemoryFloodRiskRepository();
  layers.areas = [makeArea({ unitName: "West LGA", geometry: cellRectangle(0, 0, 60, 50) })];
  imports = new RecordingFloodRiskImports();
  vi.spyOn(AuthService, "Instance", "get").mockReturnValue(new AuthService(users, new FakeTokenVerifier()));
  vi.spyOn(FloodRiskService, "Instance", "get").mockReturnValue(
    new FloodRiskService(layers, imports, new InMemoryCountryRepository([makeCountry()]), new InMemoryDataSourceRepository([source]), new InMemoryAdminUnitRepository([])),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const app = createApp();
const asAdmin = { Authorization: "Bearer valid:admin-uid" };
const asMember = { Authorization: "Bearer valid:member-uid" };

const tiff = () => buildClassTiff({ width: 60, height: 50, ...ORIGIN, values: Array.from({ length: 3000 }, (_, i) => 1 + (i % 5)), nodata: -9999, float: true });

describe("POST /api/v1/imports/flood-risk", () => {
  it("is Administrator-only", async () => {
    const res = await request(app).post("/api/v1/imports/flood-risk").set(asMember).field("countryCode", "NGA").field("sourceId", source.id).attach("file", await tiff(), "flood_risk_map.tif");
    expect(res.status).toBe(403);
    expect(imports.created).toBeUndefined();
  });

  it("measures the map and returns the checked run", async () => {
    const res = await request(app).post("/api/v1/imports/flood-risk").set(asAdmin).field("countryCode", "NGA").field("sourceId", source.id).attach("file", await tiff(), "flood_risk_map.tif");
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Measured 1 areas: 1 passed, 0 failed");
    expect(res.body.data).toMatchObject({ target: "flood_risk_layers", fileType: "geotiff", fileName: "flood_risk_map.tif", rowCount: 1, passedCount: 1 });
    expect(imports.created?.layer?.classCells).toEqual([600, 600, 600, 600, 600]);
  });

  it("refuses a request with no file, naming the field", async () => {
    const res = await request(app).post("/api/v1/imports/flood-risk").set(asAdmin).field("countryCode", "NGA").field("sourceId", source.id);
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: "file", message: "Choose a GeoTIFF to upload" }]);
  });

  it("refuses a missing source and a bad country code with field errors", async () => {
    const res = await request(app).post("/api/v1/imports/flood-risk").set(asAdmin).field("countryCode", "N").attach("file", await tiff(), "flood_risk_map.tif");
    expect(res.status).toBe(400);
    expect(res.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["countryCode", "sourceId"]);
  });

  it("refuses a file that isn't a GeoTIFF with a plain message", async () => {
    const res = await request(app).post("/api/v1/imports/flood-risk").set(asAdmin).field("countryCode", "NGA").field("sourceId", source.id).attach("file", Buffer.from("not a tiff"), "flood_risk_map.tif");
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toMatchObject({ field: "file" });
    expect(res.body.errors[0].message).toMatch(/isn't a GeoTIFF/);
  });

  it("sends a GeoTIFF uploaded to the areas import to the right place", async () => {
    const res = await request(app).post("/api/v1/imports/preview").set(asAdmin).attach("file", await tiff(), "flood_risk_map.tif");
    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toMatch(/choose "Flood risk map"/);
  });
});

describe("GET /api/v1/imports/:id/flood-risk", () => {
  const runId = "30000000-0000-4000-8000-000000000001";

  it("returns the map a run staged, for administrators only", async () => {
    layers.layers = [makeLayerRecord({ status: "staged", promotedAt: null })];
    expect((await request(app).get(`/api/v1/imports/${runId}/flood-risk`).set(asMember)).status).toBe(403);
    const res = await request(app).get(`/api/v1/imports/${runId}/flood-risk`).set(asAdmin);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "staged", dataType: "DERIVED" });
  });

  it("404s for a run that has no map", async () => {
    expect((await request(app).get(`/api/v1/imports/${runId}/flood-risk`).set(asAdmin)).status).toBe(404);
  });
});

describe("GET /api/v1/flood-risk", () => {
  it("needs a signed-in user and a country", async () => {
    expect((await request(app).get("/api/v1/flood-risk?countryCode=NGA")).status).toBe(401);
    expect((await request(app).get("/api/v1/flood-risk").set(asMember)).status).toBe(400);
  });

  it("says there is no live map yet, rather than failing", async () => {
    const res = await request(app).get("/api/v1/flood-risk?countryCode=NGA").set(asMember);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });

  it("gives any signed-in user the live map, but never one that is only staged", async () => {
    layers.layers = [makeLayerRecord({ status: "staged", promotedAt: null })];
    expect((await request(app).get("/api/v1/flood-risk?countryCode=NGA").set(asMember)).body.data).toBeNull();

    layers.layers = [makeLayerRecord()];
    const res = await request(app).get("/api/v1/flood-risk?countryCode=NGA").set(asMember);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: "50000000-0000-4000-8000-000000000001", status: "live", title: "flood_risk_map" });
    expect(res.body.data.classes).toHaveLength(5);
    expect(res.body.data.source.provider).toBe("geoBoundaries");
  });
});

describe("GET /api/v1/flood-risk/layers/:id/image", () => {
  const live = makeLayerRecord();
  const staged = makeLayerRecord({ id: "50000000-0000-4000-8000-000000000002", status: "staged", importRunId: null });

  beforeEach(() => {
    layers.layers = [live, staged];
    layers.images.set(live.id, Buffer.from("89504e47", "hex"));
    layers.images.set(staged.id, Buffer.from("89504e47", "hex"));
  });

  it("sends the live picture as a PNG the browser may keep", async () => {
    const res = await request(app).get(`/api/v1/flood-risk/layers/${live.id}/image`).set(asMember).buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/png/);
    expect(res.headers["cache-control"]).toBe("private, max-age=31536000, immutable");
    expect(Buffer.from(res.body as Buffer).toString("hex")).toBe("89504e47");
  });

  it("keeps a staged picture from everyone but administrators", async () => {
    expect((await request(app).get(`/api/v1/flood-risk/layers/${staged.id}/image`).set(asMember)).status).toBe(404);
    expect((await request(app).get(`/api/v1/flood-risk/layers/${staged.id}/image`).set(asAdmin)).status).toBe(200);
  });

  it("rejects an id that isn't one", async () => {
    expect((await request(app).get("/api/v1/flood-risk/layers/not-an-id/image").set(asMember)).status).toBe(400);
  });
});

describe("GET /api/v1/flood-risk/at", () => {
  it("validates the point and the country", async () => {
    expect((await request(app).get("/api/v1/flood-risk/at?lon=200&lat=4.8&countryCode=NGA").set(asMember)).status).toBe(400);
    expect((await request(app).get("/api/v1/flood-risk/at?lon=6.9&lat=4.8").set(asMember)).status).toBe(400);
  });

  it("answers null when there is no live map", async () => {
    const res = await request(app).get("/api/v1/flood-risk/at?lon=6.9&lat=4.8&countryCode=NGA").set(asMember);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeNull();
  });
});
