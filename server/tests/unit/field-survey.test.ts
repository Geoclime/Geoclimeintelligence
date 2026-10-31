import { afterEach, describe, expect, it } from "vitest";
import type { AuthUser } from "../../src/common/access/auth-user";
import { ConflictError, ForbiddenError, NotFoundError } from "../../src/common/errors/app-error";
import { domainEvents } from "../../src/common/events/domain-events";
import { DrainageService } from "../../src/modules/field-survey/drainage.service";
import { createDrainageSchema, createFloodExtentSchema, updateDrainageSchema } from "../../src/modules/field-survey/field-survey.validation";
import { FloodExtentService } from "../../src/modules/field-survey/flood-extent.service";
import { distinctPoints, isLineKind, meanPoint, needsAttention } from "../../src/modules/field-survey/survey-rules";
import { InMemoryAdminUnitRepository, makeUnit } from "../geo-fakes";
import { EMPTY_IMPACT, InMemoryDrainageRepository, InMemoryFloodExtentRepository } from "../field-survey-fakes";
import { validationMessageAsync } from "../map-layer-fakes";

const state = makeUnit({ level: 1, levelName: "State", unitName: "Rivers" });
const lga = makeUnit({ level: 2, levelName: "LGA", unitName: "Port Harcourt", parentId: state.id });
const ward = makeUnit({ level: 3, levelName: "Ward", unitName: "Phward 2", parentId: lga.id });

const person = (role: AuthUser["role"], id = `u-${role}`): AuthUser => ({
  id,
  firebaseUid: id,
  email: null,
  displayName: null,
  role,
  scopeAdminUnitId: null,
  profileComplete: true,
});
const responder = person("emergency_responder");
const admin = person("administrator");

/** The corners of a flood about 200 m by 100 m, in [longitude, latitude]. */
const RING: [number, number][] = [
  [7.0, 4.8],
  [7.002, 4.8],
  [7.002, 4.801],
  [7.0, 4.801],
];

function regions(denied = new Set<string>()) {
  const asked: string[] = [];
  return {
    asked,
    assert: async (_user: AuthUser, area: string) => {
      asked.push(area);
      if (denied.has(area)) throw new ForbiddenError();
    },
  };
}

function floodService(containing = [state, lga, ward], gate = regions()) {
  const extents = new InMemoryFloodExtentRepository();
  const units = new InMemoryAdminUnitRepository([state, lga, ward]);
  units.containing = containing;
  return { service: new FloodExtentService(extents, units, gate), extents, gate };
}

function drainService(containing = [state, lga, ward], gate = regions()) {
  const drains = new InMemoryDrainageRepository();
  const units = new InMemoryAdminUnitRepository([state, lga, ward]);
  units.containing = containing;
  return { service: new DrainageService(drains, units, gate), drains, gate };
}

describe("survey rules", () => {
  it("walks open and covered drains as lines, and marks the rest as a spot", () => {
    expect(["open_drain", "covered_drain"].every((kind) => isLineKind(kind as never))).toBe(true);
    expect(["culvert", "outfall", "inlet", "retention_pond"].some((kind) => isLineKind(kind as never))).toBe(false);
  });

  it("says a drain needs attention when water is not getting through", () => {
    expect(["blocked", "overflowing", "damaged"].every((c) => needsAttention(c as never))).toBe(true);
    expect(["clear", "partly_blocked"].some((c) => needsAttention(c as never))).toBe(false);
  });

  it("counts places, not fixes: two fixes at one spot are one place", () => {
    expect(distinctPoints([[7, 4.8], [7, 4.8], [7.001, 4.8]])).toBe(2);
    expect(meanPoint([[7, 4], [9, 6]])).toEqual([8, 5]);
  });
});

describe("survey validation", () => {
  it("accepts a flood outline and refuses one that is too small or all in one place", () => {
    expect(createFloodExtentSchema.safeParse({ body: { points: RING, method: "walked", depth: "knee" } }).success).toBe(true);
    expect(createFloodExtentSchema.safeParse({ body: { points: RING.slice(0, 2), method: "walked" } }).success).toBe(false);
    const stuck = createFloodExtentSchema.safeParse({ body: { points: [[7, 4.8], [7, 4.8], [7, 4.8]], method: "walked" } });
    expect(stuck.error?.issues[0]?.message).toMatch(/same place/);
  });

  it("refuses a point off the globe, extra fields, and a null that would read as zero", () => {
    expect(createFloodExtentSchema.safeParse({ body: { points: [...RING, [200, 4.8]], method: "drawn" } }).success).toBe(false);
    expect(createFloodExtentSchema.safeParse({ body: { points: RING, method: "drawn", recordedBy: "me" } }).success).toBe(false);
    expect(createFloodExtentSchema.safeParse({ body: { points: [...RING, [null, 4.8]], method: "drawn" } }).success).toBe(false);
  });

  it("wants a drain walked as a line, and a culvert as one spot", () => {
    const base = { condition: "blocked", method: "walked" };
    expect(createDrainageSchema.safeParse({ body: { ...base, kind: "open_drain", points: [[7, 4.8], [7.001, 4.8]] } }).success).toBe(true);
    expect(createDrainageSchema.safeParse({ body: { ...base, kind: "open_drain", points: [[7, 4.8]] } }).success).toBe(false);
    expect(createDrainageSchema.safeParse({ body: { ...base, kind: "culvert", points: [[7, 4.8]] } }).success).toBe(true);
    expect(createDrainageSchema.safeParse({ body: { ...base, kind: "culvert", points: [[7, 4.8], [7.001, 4.8]] } }).success).toBe(false);
  });

  it("limits a drain's size, and needs something to change on an inspection", () => {
    const body = { kind: "culvert", condition: "clear", method: "drawn", points: [[7, 4.8]] };
    expect(createDrainageSchema.safeParse({ body: { ...body, widthM: 500 } }).success).toBe(false);
    expect(createDrainageSchema.safeParse({ body: { ...body, widthM: 1.5, depthM: 0.5 } }).success).toBe(true);
    const id = "80000000-0000-4000-8000-000000000001";
    expect(updateDrainageSchema.safeParse({ params: { id }, body: {} }).success).toBe(false);
    expect(updateDrainageSchema.safeParse({ params: { id }, body: { condition: "clear" } }).success).toBe(true);
    expect(updateDrainageSchema.safeParse({ params: { id }, body: { widthM: null } }).success).toBe(true);
  });
});

describe("FloodExtentService", () => {
  const outline = { points: RING, method: "walked" as const, depth: "knee" as const, note: "Water to the fence", accuracyM: 9 };

  it("saves the outline in the ward it is in, and says what the flood reaches", async () => {
    const { service, extents, gate } = floodService();
    extents.impact = { ...EMPTY_IMPACT, buildings: 42, wards: ["Phward 2"] };

    const saved = await service.create(outline, responder);

    expect(extents.created[0]).toMatchObject({ countryCode: "NGA", wardId: ward.id, lgaId: lga.id, method: "walked", depth: "knee", note: "Water to the fence", accuracyM: 9, recordedBy: responder.id });
    expect(saved.impact).toMatchObject({ buildings: 42, wards: ["Phward 2"] });
    expect(gate.asked).toEqual([ward.id]);
  });

  it("refuses a flood outside every mapped area, and saves nothing", async () => {
    const { service, extents } = floodService([]);
    expect(await validationMessageAsync(() => service.create(outline, responder))).toMatch(/outside every mapped area/);
    expect(extents.created).toEqual([]);
  });

  it("refuses a shape PostGIS measured as no flood (a GPS jump), saying why", async () => {
    const { service, extents } = floodService();
    extents.tooSmall = true;
    expect(await validationMessageAsync(() => service.create(outline, responder))).toMatch(/less than 10 m².*50 km²/);
  });

  it("keeps a region-scoped responder inside their region", async () => {
    const { service, extents } = floodService([state, lga, ward], regions(new Set([ward.id])));
    await expect(service.create(outline, responder)).rejects.toBeInstanceOf(ForbiddenError);
    expect(extents.created).toEqual([]);
  });

  it("marks a flood receded once, and says 409 the second time", async () => {
    const { service, extents } = floodService();
    const flood = extents.seed();
    expect(await service.recede(flood.id, responder)).toMatchObject({ receded: true });
    await expect(service.recede(flood.id, responder)).rejects.toBeInstanceOf(ConflictError);
    await expect(service.recede("70000000-0000-4000-8000-0000000000ff", responder)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("lets only the recorder or an administrator delete a flood", async () => {
    const { service, extents } = floodService();
    const flood = extents.seed({ recordedBy: responder.id });

    await expect(service.remove(flood.id, person("emergency_responder", "another"))).rejects.toBeInstanceOf(ForbiddenError);
    expect(extents.rows.has(flood.id)).toBe(true);
    await service.remove(flood.id, responder);
    expect(extents.rows.has(flood.id)).toBe(false);

    const other = extents.seed({ recordedBy: "someone" });
    await service.remove(other.id, admin);
    expect(extents.rows.has(other.id)).toBe(false);
  });

  it("reads the impact of a flood that is there, and 404s for one that is not", async () => {
    const { service, extents } = floodService();
    const flood = extents.seed();
    expect(await service.impact(flood.id)).toEqual(EMPTY_IMPACT);
    await expect(service.impact("70000000-0000-4000-8000-0000000000ff")).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("FloodExtentService.history: a place's flood history", () => {
  const elsewhere = makeUnit({ level: 2, levelName: "LGA", unitName: "Eleme", parentId: state.id });

  it("lists the floods recorded in the LGA, receded ones too, newest first, and counts them all", async () => {
    const { service, extents } = floodService();
    extents.seed({ lgaId: lga.id, observedAt: "2026-09-01T09:00:00.000Z", receded: true, recededAt: "2026-09-02T09:00:00.000Z", areaM2: 90_000 });
    extents.seed({ lgaId: lga.id, observedAt: "2026-10-30T09:00:00.000Z", areaM2: 12_000 });
    extents.seed({ lgaId: elsewhere.id, observedAt: "2026-10-31T09:00:00.000Z", areaM2: 5_000_000 });

    const history = await service.history(lga.id, 20);

    expect(history).toMatchObject({ total: 2, active: 1, largestAreaM2: 90_000, latestAt: "2026-10-30T09:00:00.000Z" });
    expect(history.items.map((item) => [item.areaM2, item.receded])).toEqual([[12_000, false], [90_000, true]]);
  });

  it("also answers for a ward, by the ward the flood was filed under", async () => {
    const { service, extents } = floodService();
    extents.seed({ lgaId: lga.id, wardId: ward.id });
    extents.seed({ lgaId: lga.id, wardId: null });
    expect((await service.history(ward.id, 20)).total).toBe(1);
    expect((await service.history(lga.id, 20)).total).toBe(2);
  });

  it("caps the list but not the totals", async () => {
    const { service, extents } = floodService();
    for (let n = 0; n < 5; n++) extents.seed({ lgaId: lga.id, observedAt: `2026-10-0${n + 1}T09:00:00.000Z` });
    const history = await service.history(lga.id, 2);
    expect(history.items).toHaveLength(2);
    expect(history.total).toBe(5);
  });

  it("says nothing about who recorded a flood or what they wrote", async () => {
    const { service, extents } = floodService();
    extents.seed({ lgaId: lga.id, note: "Water to the fence", recordedBy: "someone-secret" });
    const [item] = (await service.history(lga.id, 20)).items;
    expect(Object.keys(item!).sort()).toEqual(["areaM2", "depth", "id", "latitude", "longitude", "method", "observedAt", "receded", "recededAt", "wardName"]);
  });

  it("is empty for a place with no floods, and 404 for an area that does not exist", async () => {
    const { service } = floodService();
    expect(await service.history(lga.id, 20)).toEqual({ total: 0, active: 0, largestAreaM2: 0, latestAt: null, items: [] });
    await expect(service.history("10000000-0000-4000-8000-0000000000ff", 20)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("FloodExtentService and the public alert map", () => {
  const outline = { points: RING, method: "walked" as const };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  afterEach(() => domainEvents.clear());

  it("lists the floods still going for the public map, asking for the days and cap the rules give", async () => {
    const { service, extents } = floodService();
    const going = extents.seed({ longitude: 7.01234, latitude: 4.78567, areaM2: 12_345.6 });
    const over = extents.seed({ receded: true });

    const floods = await service.publicActive();

    expect(extents.activeCalls).toEqual([{ days: 3, limit: 200 }]);
    expect(floods.map((flood) => flood.id)).toEqual([going.id]);
    expect(floods[0]).toMatchObject({ point: [7.012, 4.786], areaM2: 12_346, depth: "knee" });
    expect(floods.some((flood) => flood.id === over.id)).toBe(false);
  });

  it("gives the public map nothing that identifies the recorder or says what they wrote", async () => {
    const { service, extents } = floodService();
    extents.seed({ note: "Water to the fence", recordedBy: "someone-secret" });
    const [flood] = await service.publicActive();
    expect(Object.keys(flood!).sort()).toEqual(["areaM2", "depth", "id", "lgaName", "observedAt", "point"]);
  });

  it("announces a flood recorded, receded or deleted, so the public map refreshes", async () => {
    const { service, extents } = floodService();
    const heard: string[] = [];
    for (const name of ["flood.recorded", "flood.receded", "flood.deleted"] as const) domainEvents.on(name, ({ floodId }) => void heard.push(`${name}:${floodId}`));

    const { extent } = await service.create(outline, responder);
    await service.recede(extent.id, responder);
    await service.remove(extent.id, admin);
    await settle();

    expect(heard).toEqual([`flood.recorded:${extent.id}`, `flood.receded:${extent.id}`, `flood.deleted:${extent.id}`]);
    expect(extents.rows.has(extent.id)).toBe(false);
  });

  it("announces nothing when a flood is refused", async () => {
    const { service, extents } = floodService();
    extents.tooSmall = true;
    const heard: string[] = [];
    domainEvents.on("flood.recorded", () => void heard.push("recorded"));
    await expect(service.create(outline, responder)).rejects.toBeDefined();
    await settle();
    expect(heard).toEqual([]);
  });
});

describe("DrainageService", () => {
  const culvert = { kind: "culvert" as const, condition: "blocked" as const, method: "drawn" as const, points: [[7.0012, 4.8003]] as [number, number][], name: " Mission Road culvert ", note: "" };

  it("saves a spot in the ward it is at, tidying the name and treating a blank note as none", async () => {
    const { service, drains } = drainService();
    const saved = await service.create({ ...culvert, widthM: 1.5 }, responder);
    expect(drains.created[0]).toMatchObject({ countryCode: "NGA", wardId: ward.id, kind: "culvert", condition: "blocked", widthM: 1.5, depthM: null, note: null, recordedBy: responder.id });
    expect(saved).toMatchObject({ kind: "culvert", condition: "blocked", longitude: 7.0012 });
  });

  it("refuses a drain outside the map or of an impossible length", async () => {
    const outside = drainService([]);
    expect(await validationMessageAsync(() => outside.service.create(culvert, responder))).toMatch(/outside every mapped area/);

    const short = drainService();
    short.drains.tooShort = true;
    expect(await validationMessageAsync(() => short.service.create({ ...culvert, kind: "open_drain", points: [[7, 4.8], [7.0001, 4.8]] }, responder))).toMatch(/shorter than 2 m or longer than 50 km/);
  });

  it("re-inspects a drain: changes what was sent, keeps the rest, and moves 'last checked'", async () => {
    const { service, drains } = drainService();
    const drain = drains.seed({ condition: "blocked" });

    const cleared = await service.update(drain.id, { condition: "clear" }, responder);
    expect(cleared).toMatchObject({ condition: "clear", name: "Aba Road drain", widthM: 1.2, note: "Silted up near the bridge", lastCheckedAt: "2026-10-31T10:00:00.000Z" });

    const wiped = await service.update(drain.id, { note: "", widthM: null }, responder);
    expect(wiped).toMatchObject({ condition: "clear", note: null, widthM: null });
  });

  it("keeps a region-scoped responder from inspecting a drain outside their region", async () => {
    const { service, drains } = drainService([state, lga, ward], regions(new Set([ward.id])));
    const drain = drains.seed({ wardId: ward.id });
    await expect(service.update(drain.id, { condition: "clear" }, responder)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lets only the recorder or an administrator delete a drain, and 404s for one that is not there", async () => {
    const { service, drains } = drainService();
    const drain = drains.seed({ recordedBy: responder.id });

    await expect(service.remove(drain.id, person("government_official"))).rejects.toBeInstanceOf(ForbiddenError);
    await service.remove(drain.id, responder);
    expect(drains.rows.has(drain.id)).toBe(false);
    await expect(service.remove(drain.id, admin)).rejects.toBeInstanceOf(NotFoundError);
  });
});
