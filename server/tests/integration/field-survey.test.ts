import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/app";
import { AuthService } from "../../src/modules/auth/auth.service";
import { DrainageService } from "../../src/modules/field-survey/drainage.service";
import { FloodExtentService } from "../../src/modules/field-survey/flood-extent.service";
import { FakeTokenVerifier, InMemoryUserRepository, makeUser } from "../fakes";
import { InMemoryDrainageRepository, InMemoryFloodExtentRepository } from "../field-survey-fakes";
import { InMemoryAdminUnitRepository, makeUnit } from "../geo-fakes";

// Drives the real Express app (middleware order, role checks, validation, error handler) with every
// repository swapped for an in-memory fake. The spatial SQL is not exercised here; it runs in PostGIS.

const state = makeUnit({ level: 1, levelName: "State", unitName: "Rivers" });
const ward = makeUnit({ level: 3, levelName: "Ward", unitName: "Phward 2" });

let extents: InMemoryFloodExtentRepository;
let drains: InMemoryDrainageRepository;
let responder: ReturnType<typeof makeUser>;

beforeEach(() => {
  responder = makeUser({ firebaseUid: "responder-uid", role: "emergency_responder" });
  const users = new InMemoryUserRepository([
    makeUser({ firebaseUid: "member-uid" }),
    responder,
    makeUser({ firebaseUid: "other-responder-uid", role: "emergency_responder" }),
    makeUser({ firebaseUid: "admin-uid", role: "administrator" }),
  ]);
  extents = new InMemoryFloodExtentRepository();
  drains = new InMemoryDrainageRepository();
  const units = new InMemoryAdminUnitRepository([state, ward]);
  units.containing = [state, ward];
  const regions = { assert: async () => {} };
  vi.spyOn(AuthService, "Instance", "get").mockReturnValue(new AuthService(users, new FakeTokenVerifier()));
  vi.spyOn(FloodExtentService, "Instance", "get").mockReturnValue(new FloodExtentService(extents, units, regions));
  vi.spyOn(DrainageService, "Instance", "get").mockReturnValue(new DrainageService(drains, units, regions));
});

afterEach(() => {
  vi.restoreAllMocks();
});

const app = createApp();
const asMember = { Authorization: "Bearer valid:member-uid" };
const asResponder = { Authorization: "Bearer valid:responder-uid" };
const asOtherResponder = { Authorization: "Bearer valid:other-responder-uid" };
const asAdmin = { Authorization: "Bearer valid:admin-uid" };
const BBOX = "6.9,4.7,7.1,4.9";

const outline = {
  points: [[7.0, 4.8], [7.002, 4.8], [7.002, 4.801], [7.0, 4.801]],
  method: "walked",
  depth: "waist",
  accuracyM: 8,
};

describe("/api/v1/flood-extents", () => {
  it("lets a responder save the outline of a flood, and returns what it reaches", async () => {
    const res = await request(app).post("/api/v1/flood-extents").set(asResponder).send(outline);
    expect(res.status).toBe(201);
    expect(res.body.data.extent).toMatchObject({ method: "walked", depth: "waist", receded: false });
    expect(res.body.data.impact).toMatchObject({ buildings: 0, drains: { total: 0 } });
    expect(extents.created[0]).toMatchObject({ countryCode: "NGA", wardId: ward.id, recordedBy: responder.id });
  });

  it("is for responders, officials and administrators: 403 for the public, 401 when signed out", async () => {
    expect((await request(app).post("/api/v1/flood-extents").set(asMember).send(outline)).status).toBe(403);
    expect((await request(app).post("/api/v1/flood-extents").send(outline)).status).toBe(401);
    expect((await request(app).post("/api/v1/flood-extents").set(asAdmin).send(outline)).status).toBe(201);
    expect(extents.created).toHaveLength(1);
  });

  it("refuses a bad outline (400) and one the database measures as no flood (400)", async () => {
    const tooFew = await request(app).post("/api/v1/flood-extents").set(asResponder).send({ ...outline, points: outline.points.slice(0, 2) });
    expect(tooFew.status).toBe(400);
    expect(tooFew.body.errors[0].message).toMatch(/at least three points/);

    extents.tooSmall = true;
    const tooSmall = await request(app).post("/api/v1/flood-extents").set(asResponder).send(outline);
    expect(tooSmall.status).toBe(400);
    expect(tooSmall.body.errors[0].message).toMatch(/less than 10 m²/);
  });

  it("shows the map layer to any signed-in user, and needs a bbox", async () => {
    const res = await request(app).get("/api/v1/flood-extents/geojson").query({ bbox: BBOX, zoom: "12" }).set(asMember);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ type: "FeatureCollection", features: [], truncated: false });
    expect((await request(app).get("/api/v1/flood-extents/geojson").set(asMember)).status).toBe(400);
    expect((await request(app).get("/api/v1/flood-extents/geojson").query({ bbox: BBOX })).status).toBe(401);
  });

  it("shows a place's flood history to any signed-in user, and checks the question", async () => {
    extents.seed({ lgaId: ward.id });
    const res = await request(app).get("/api/v1/flood-extents/history").query({ areaId: ward.id, limit: "5" }).set(asMember);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ total: 1, active: 1 });
    expect(res.body.data.items).toHaveLength(1);

    expect((await request(app).get("/api/v1/flood-extents/history").set(asMember)).status).toBe(400);
    expect((await request(app).get("/api/v1/flood-extents/history").query({ areaId: ward.id, limit: "500" }).set(asMember)).status).toBe(400);
    expect((await request(app).get("/api/v1/flood-extents/history").query({ areaId: "70000000-0000-4000-8000-0000000000ff" }).set(asMember)).status).toBe(404);
    expect((await request(app).get("/api/v1/flood-extents/history").query({ areaId: ward.id })).status).toBe(401);
  });

  it("shows a flood's impact to any signed-in user, and 404s for one that is not there", async () => {
    const flood = extents.seed();
    expect((await request(app).get(`/api/v1/flood-extents/${flood.id}/impact`).set(asMember)).status).toBe(200);
    expect((await request(app).get("/api/v1/flood-extents/70000000-0000-4000-8000-0000000000ff/impact").set(asMember)).status).toBe(404);
    expect((await request(app).get("/api/v1/flood-extents/not-an-id/impact").set(asMember)).status).toBe(400);
  });

  it("lets a responder mark a flood receded, once", async () => {
    const flood = extents.seed();
    expect((await request(app).post(`/api/v1/flood-extents/${flood.id}/recede`).set(asMember)).status).toBe(403);
    expect((await request(app).post(`/api/v1/flood-extents/${flood.id}/recede`).set(asResponder)).status).toBe(200);
    expect((await request(app).post(`/api/v1/flood-extents/${flood.id}/recede`).set(asResponder)).status).toBe(409);
  });

  it("lets only the recorder or an administrator delete a flood", async () => {
    const flood = extents.seed({ recordedBy: responder.id });
    expect((await request(app).delete(`/api/v1/flood-extents/${flood.id}`).set(asOtherResponder)).status).toBe(403);
    expect((await request(app).delete(`/api/v1/flood-extents/${flood.id}`).set(asResponder)).status).toBe(200);

    const other = extents.seed({ recordedBy: responder.id });
    expect((await request(app).delete(`/api/v1/flood-extents/${other.id}`).set(asAdmin)).status).toBe(200);
  });
});

describe("/api/v1/drainage", () => {
  const culvert = { kind: "culvert", condition: "blocked", method: "drawn", points: [[7.0012, 4.8003]], name: "Mission Road culvert" };

  it("lets a responder record a drain, and anyone in the field role re-inspect it", async () => {
    const saved = await request(app).post("/api/v1/drainage").set(asResponder).send(culvert);
    expect(saved.status).toBe(201);
    expect(saved.body.data).toMatchObject({ kind: "culvert", condition: "blocked", name: "Mission Road culvert" });

    const id = saved.body.data.id as string;
    const cleared = await request(app).patch(`/api/v1/drainage/${id}`).set(asOtherResponder).send({ condition: "clear" });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data).toMatchObject({ condition: "clear", name: "Mission Road culvert" });
  });

  it("is for responders, officials and administrators: 403 for the public", async () => {
    const drain = drains.seed();
    expect((await request(app).post("/api/v1/drainage").set(asMember).send(culvert)).status).toBe(403);
    expect((await request(app).patch(`/api/v1/drainage/${drain.id}`).set(asMember).send({ condition: "clear" })).status).toBe(403);
    expect((await request(app).delete(`/api/v1/drainage/${drain.id}`).set(asMember)).status).toBe(403);
    expect(drains.created).toEqual([]);
  });

  it("refuses a culvert walked as a line, and an empty inspection (400)", async () => {
    const line = await request(app).post("/api/v1/drainage").set(asResponder).send({ ...culvert, points: [[7, 4.8], [7.001, 4.8]] });
    expect(line.status).toBe(400);
    expect(line.body.errors[0].message).toMatch(/single point/);

    const drain = drains.seed();
    expect((await request(app).patch(`/api/v1/drainage/${drain.id}`).set(asResponder).send({})).status).toBe(400);
  });

  it("shows the map layer to any signed-in user", async () => {
    const res = await request(app).get("/api/v1/drainage/geojson").query({ bbox: BBOX }).set(asMember);
    expect(res.status).toBe(200);
    expect(res.body.data.truncated).toBe(false);
  });

  it("lets only the recorder or an administrator delete a drain", async () => {
    const drain = drains.seed({ recordedBy: responder.id });
    expect((await request(app).delete(`/api/v1/drainage/${drain.id}`).set(asOtherResponder)).status).toBe(403);
    expect((await request(app).delete(`/api/v1/drainage/${drain.id}`).set(asAdmin)).status).toBe(200);
    expect((await request(app).delete(`/api/v1/drainage/${drain.id}`).set(asAdmin)).status).toBe(404);
  });
});
