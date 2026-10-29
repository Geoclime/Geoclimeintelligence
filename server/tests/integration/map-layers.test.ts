import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { AuthService } from "../../src/modules/auth/auth.service";
import { MapLayerLoaderService, type LoadReport } from "../../src/modules/map-layers/map-layer-loader.service";
import { MapLayerService } from "../../src/modules/map-layers/map-layer.service";
import { FakeTokenVerifier, InMemoryUserRepository, makeUser } from "../fakes";
import { InMemoryDataSourceRepository, makeSource } from "../geo-fakes";
import { RecordingLayerRepository } from "../map-layer-fakes";

// Drives the real Express app (middleware order, validation, error handler) with every
// repository swapped for an in-memory fake. The layers' spatial SQL is not exercised here; it
// runs in PostGIS (docs/map-layers.md says how it was checked).

const source = makeSource({ id: "30000000-0000-4000-8000-000000000001", provider: "OpenStreetMap contributors via HDX", license: "ODbL" });
let roads: RecordingLayerRepository;
let waterways: RecordingLayerRepository;
let settlements: RecordingLayerRepository;
let infrastructure: RecordingLayerRepository;
let buildings: RecordingLayerRepository;

beforeEach(() => {
  const users = new InMemoryUserRepository([
    makeUser({ firebaseUid: "member-uid" }),
    makeUser({ firebaseUid: "admin-uid", role: "administrator" }),
  ]);
  roads = new RecordingLayerRepository({ featureCount: 47_507, sourceIds: [source.id] });
  waterways = new RecordingLayerRepository({ featureCount: 4_033, sourceIds: [source.id] });
  settlements = new RecordingLayerRepository();
  infrastructure = new RecordingLayerRepository();
  buildings = new RecordingLayerRepository();
  vi.spyOn(AuthService, "Instance", "get").mockReturnValue(new AuthService(users, new FakeTokenVerifier()));
  vi.spyOn(MapLayerService, "Instance", "get").mockReturnValue(
    new MapLayerService({ roads, waterways, settlements, infrastructure, buildings }, new InMemoryDataSourceRepository([source])),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const app = createApp();
const asMember = { Authorization: "Bearer valid:member-uid" };
const asAdmin = { Authorization: "Bearer valid:admin-uid" };
const BBOX = "6.9,4.7,7.1,4.9";

describe("POST /api/v1/map-layers/upload: buildings", () => {
  const SOURCE = "40000000-0000-4000-8000-00000000000b";
  const emptyReport: LoadReport = { dryRun: false, layers: [] };

  it("hands an administrator's buildings upload to the loader, with 'load even if rows are missing'", async () => {
    const load = vi.spyOn(MapLayerLoaderService.prototype, "load").mockResolvedValue(emptyReport);
    const res = await request(app)
      .post("/api/v1/map-layers/upload")
      .set(asAdmin)
      .field("countryCode", "NGA")
      .field("layer", "buildings")
      .field("sourceId", SOURCE)
      .field("acceptPartial", "true")
      .attach("file", Buffer.from("PK"), "osm.zip");

    expect(res.status).toBe(201);
    expect(load).toHaveBeenCalledWith(
      expect.objectContaining({
        countryCode: "NGA",
        acceptPartial: true,
        buildings: expect.objectContaining({ fileName: "osm.zip", sourceId: SOURCE }),
      }),
    );
  });

  it("leaves partial loads off unless asked, and needs a source and an administrator", async () => {
    const load = vi.spyOn(MapLayerLoaderService.prototype, "load").mockResolvedValue(emptyReport);
    const upload = (headers: Record<string, string>, fields: Record<string, string>) => {
      const req = request(app).post("/api/v1/map-layers/upload").set(headers);
      for (const [name, value] of Object.entries(fields)) req.field(name, value);
      return req.attach("file", Buffer.from("PK"), "osm.zip");
    };

    expect((await upload(asAdmin, { countryCode: "NGA", layer: "buildings", sourceId: SOURCE })).status).toBe(201);
    expect(load.mock.calls[0]![0]).toMatchObject({ acceptPartial: false });
    expect((await upload(asAdmin, { countryCode: "NGA", layer: "buildings" })).status).toBe(400);
    expect((await upload(asMember, { countryCode: "NGA", layer: "buildings", sourceId: SOURCE })).status).toBe(403);
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/v1/map-layers", () => {
  it("lists the layers with their sources for any signed-in user", async () => {
    const res = await request(app).get("/api/v1/map-layers").set(asMember);
    expect(res.status).toBe(200);
    expect(res.body.data.map((layer: { id: string }) => layer.id)).toEqual(["roads", "waterways", "settlements", "infrastructure", "buildings"]);
    expect(res.body.data[0]).toMatchObject({ featureCount: 47_507, sources: [{ provider: "OpenStreetMap contributors via HDX", license: "ODbL" }] });
  });

  it("needs a signed-in user (401)", async () => {
    expect((await request(app).get("/api/v1/map-layers")).status).toBe(401);
  });
});

describe.each([
  ["roads", () => roads],
  ["waterways", () => waterways],
  ["settlements", () => settlements],
  ["infrastructure", () => infrastructure],
  ["buildings", () => buildings],
])("GET /api/v1/%s/geojson", (name, repo) => {
  const url = `/api/v1/${name}/geojson`;

  it("returns the layer for the visible area, and says whether it was cut short", async () => {
    const res = await request(app).get(url).query({ bbox: BBOX, zoom: "11.4" }).set(asMember);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ type: "FeatureCollection", features: [], truncated: false });
    expect(repo().queries).toEqual([{ bbox: [6.9, 4.7, 7.1, 4.9], zoom: 11.4 }]);
  });

  it("works without a zoom", async () => {
    const res = await request(app).get(url).query({ bbox: BBOX }).set(asMember);
    expect(res.status).toBe(200);
    expect(repo().queries[0]).toEqual({ bbox: [6.9, 4.7, 7.1, 4.9] });
  });

  it("refuses a request with no bbox (400): a whole layer is never served", async () => {
    const res = await request(app).get(url).set(asMember);
    expect(res.status).toBe(400);
    expect(res.body.errors[0].message).toMatch(/bbox is required/);
    expect(repo().queries).toEqual([]);
  });

  it("refuses an impossible bbox or zoom (400)", async () => {
    expect((await request(app).get(url).query({ bbox: "7,5,6,4" }).set(asMember)).status).toBe(400);
    expect((await request(app).get(url).query({ bbox: BBOX, zoom: "40" }).set(asMember)).status).toBe(400);
  });

  it("needs a signed-in user (401)", async () => {
    expect((await request(app).get(url).query({ bbox: BBOX })).status).toBe(401);
  });
});
