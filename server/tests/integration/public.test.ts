import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { AdminUnitService } from "../../src/modules/admin-units/admin-unit.service";
import { AuthService } from "../../src/modules/auth/auth.service";
import { PublicService } from "../../src/modules/public/public.service";
import { PUBLIC_REQUESTS_PER_MINUTE } from "../../src/modules/public/public.routes";
import { RainfallService } from "../../src/modules/rainfall/rainfall.service";
import { InMemoryUserRepository, FakeTokenVerifier } from "../fakes";
import { InMemoryAdminUnitRepository, InMemoryDataSourceRepository, InMemoryRainfallRepository, makeSource, makeUnit } from "../geo-fakes";

// Drives the real Express app with the repositories swapped for in-memory fakes, to prove the
// public routes need no token, answer their own 404s, and leave every other route guarded.

const source = makeSource();
const rivers = makeUnit({ level: 1, levelName: "State", unitName: "Rivers", unitCode: "NG-RI" });
const okrika = makeUnit({ level: 2, levelName: "LGA", unitName: "Okrika", parentId: rivers.id });
let verifySpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  const units = Object.assign(new InMemoryAdminUnitRepository([rivers, okrika]), {
    summariseLevels: async () => [{ level: 2, levelName: "LGA", count: 1, sourceIds: [source.id] }],
  });
  units.containing = [rivers, okrika];
  const sources = new InMemoryDataSourceRepository([source]);
  const authService = new AuthService(new InMemoryUserRepository(), new FakeTokenVerifier());
  verifySpy = vi.spyOn(authService, "verifyToken");
  vi.spyOn(AuthService, "Instance", "get").mockReturnValue(authService);
  vi.spyOn(PublicService, "Instance", "get").mockReturnValue(
    new PublicService({
      units,
      areas: new AdminUnitService(units, sources),
      layers: { catalog: async () => [] },
      rainfall: new RainfallService(new InMemoryRainfallRepository(), units, sources),
      coverage: { findCoverage: async () => null },
      communities: { searchByName: async () => [] },
      sources,
      alerts: { list: async () => [] },
      floodReports: { publishedSince: async () => [] },
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

const app = createApp();

describe("public routes", () => {
  it("serves the overview with no token, never touching the token check", async () => {
    const res = await request(app).get("/api/v1/public/overview");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.areas).toEqual([{ level: 2, levelName: "LGA", count: 1 }]);
    expect(res.body.data.sources).toEqual([
      { id: source.id, provider: source.provider, datasetName: source.datasetName, url: source.url, license: source.license },
    ]);
    expect(res.headers["cache-control"]).toBe("public, max-age=300");
    expect(res.headers["ratelimit-limit"]).toBe(String(PUBLIC_REQUESTS_PER_MINUTE));
    expect(verifySpy).not.toHaveBeenCalled();
  });

  it("never lets the alert map be reused without checking, so an alert can't be held back", async () => {
    const res = await request(app).get("/api/v1/public/alert-map");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("public, no-cache");
    expect(res.headers["etag"]).toBeTruthy();
    // Asking again with that ETag costs almost nothing when nothing changed.
    expect((await request(app).get("/api/v1/public/alert-map").set("If-None-Match", String(res.headers["etag"]))).status).toBe(304);
  });

  it("serves the outline, an area and a located point with no token", async () => {
    expect((await request(app).get("/api/v1/public/outline")).status).toBe(200);

    const area = await request(app).get(`/api/v1/public/areas/${okrika.id}`);
    expect(area.status).toBe(200);
    expect(area.body.data.parents.map((p: { unitName: string }) => p.unitName)).toEqual(["Rivers"]);

    const located = await request(app).get("/api/v1/public/locate?lon=7.05&lat=4.75");
    expect(located.status).toBe(200);
    expect(located.body.data.units.map((u: { unitName: string }) => u.unitName)).toEqual(["Rivers", "Okrika"]);
  });

  it("searches by name and rejects a one-letter search", async () => {
    const found = await request(app).get("/api/v1/public/search?q=okr");
    expect(found.status).toBe(200);
    expect(found.body.data.areas).toEqual([expect.objectContaining({ unitName: "Okrika", parentName: "Rivers" })]);

    const tooShort = await request(app).get("/api/v1/public/search?q=o");
    expect(tooShort.status).toBe(400);
    expect(tooShort.body.errors).toEqual([{ field: "q", message: "Type at least 2 characters" }]);
  });

  it("rejects a bad area id and coordinates off the globe with 400", async () => {
    expect((await request(app).get("/api/v1/public/areas/not-a-uuid")).status).toBe(400);
    expect((await request(app).get("/api/v1/public/locate?lon=200&lat=4.75")).status).toBe(400);
  });

  it("404s an unknown area and an unknown public path, instead of asking for a token", async () => {
    const area = await request(app).get("/api/v1/public/areas/99999999-9999-4999-8999-999999999999");
    expect(area.status).toBe(404);
    expect(area.body.message).toBe("Area not found");

    const path = await request(app).get("/api/v1/public/users");
    expect(path.status).toBe(404);
    expect(path.body).toEqual({ success: false, data: null, message: "Route GET /users not found" });
  });

  it("leaves every other /api/v1 route behind sign-in", async () => {
    const res = await request(app).get("/api/v1/admin-units");
    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Missing bearer token");
  });
});
