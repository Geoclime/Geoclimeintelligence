import { describe, expect, it } from "vitest";
import { AdminUnitService } from "../../src/modules/admin-units/admin-unit.service";
import { ALERT_MAP_TTL_MS, PublicService } from "../../src/modules/public/public.service";
import { RainfallService } from "../../src/modules/rainfall/rainfall.service";
import { InMemoryAdminUnitRepository, InMemoryDataSourceRepository, InMemoryRainfallRepository, makeUnit } from "../geo-fakes";

// The landing page's alert map is reused for a few seconds, but never held back: an alert issued
// or deleted has to show at once, so the cache is dropped the moment something changes.

const rivers = makeUnit({ level: 1, levelName: "State", unitName: "Rivers" });

function setup() {
  let time = Date.parse("2026-10-31T02:00:00.000Z");
  const state = { alerts: [] as { id: string }[], floods: [] as { id: string }[], reads: 0, gate: null as Promise<void> | null };
  const units = new InMemoryAdminUnitRepository([rivers]);
  const sources = new InMemoryDataSourceRepository([]);
  const service = new PublicService({
    units: Object.assign(units, { summariseLevels: async () => [] }),
    areas: new AdminUnitService(units, sources),
    layers: { catalog: async () => [] },
    rainfall: new RainfallService(new InMemoryRainfallRepository(), units, sources),
    coverage: { findCoverage: async () => null },
    communities: { searchByName: async () => [] },
    sources,
    alerts: {
      list: async () => {
        state.reads += 1;
        const answer = [...state.alerts];
        if (state.gate) await state.gate;
        return answer as never;
      },
    },
    floodReports: { publishedSince: async () => [] },
      floodExtents: { publicActive: async () => [...state.floods] as never },
    now: () => time,
  });
  return { service, state, advance: (ms: number) => void (time += ms) };
}

describe("PublicService.alertMap", () => {
  it("reuses its answer for a few seconds, then asks again", async () => {
    const { service, state, advance } = setup();
    await service.alertMap();
    await service.alertMap();
    expect(state.reads).toBe(1);
    advance(ALERT_MAP_TTL_MS + 1);
    await service.alertMap();
    expect(state.reads).toBe(2);
  });

  it("is a few seconds, not a minute: an alert can't be held back that long", () => {
    expect(ALERT_MAP_TTL_MS).toBeLessThanOrEqual(10_000);
  });

  it("shows a new alert at once after invalidateAlertMap, without waiting for the time to pass", async () => {
    const { service, state } = setup();
    expect((await service.alertMap()).alerts).toHaveLength(0);
    state.alerts.push({ id: "severe-1" });
    expect((await service.alertMap()).alerts).toHaveLength(0);

    service.invalidateAlertMap();
    expect((await service.alertMap()).alerts).toEqual([{ id: "severe-1" }]);

    state.alerts.length = 0;
    service.invalidateAlertMap();
    expect((await service.alertMap()).alerts).toHaveLength(0);
  });

  it("carries the floods recorded on the ground, and how many days of them it holds", async () => {
    const { service, state } = setup();
    expect(await service.alertMap()).toMatchObject({ floods: [], floodDays: 3 });

    state.floods.push({ id: "flood-1" });
    expect((await service.alertMap()).floods).toHaveLength(0);
    service.invalidateAlertMap();
    expect((await service.alertMap()).floods).toEqual([{ id: "flood-1" }]);
  });

  it("doesn't keep an answer that was being read when the change happened: it may be the old one", async () => {
    const { service, state } = setup();
    let release!: () => void;
    state.gate = new Promise<void>((resolve) => (release = resolve));
    const slow = service.alertMap();
    await Promise.resolve();

    state.alerts.push({ id: "severe-1" });
    service.invalidateAlertMap();
    state.gate = null;
    release();
    await slow;

    expect((await service.alertMap()).alerts).toEqual([{ id: "severe-1" }]);
  });
});
