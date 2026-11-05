import { describe, expect, it } from "vitest";
import type { DrainageSummary, DrainageSummaryItem } from "../types/field-survey.types";
import { describeDrainItem, drainOnMapLink, drainageFigures } from "./drainage-summary";
import { formatDate } from "./formatDate";
import { readMapView } from "./map-url";

const item = (overrides: Partial<DrainageSummaryItem> = {}): DrainageSummaryItem => ({
  id: "d1",
  kind: "open_drain",
  condition: "blocked",
  name: "Aba Road drain",
  widthM: 1.2,
  depthM: null,
  lengthM: 120,
  lastCheckedAt: "2026-10-30T09:00:00.000Z",
  wardName: "Obward 17",
  longitude: 7.0134,
  latitude: 4.8289,
  ...overrides,
});

describe("drainOnMapLink", () => {
  it("opens the main map on the drain, close enough to see it", () => {
    const link = drainOnMapLink(item());
    expect(link.startsWith("/map?")).toBe(true);
    expect(readMapView(new URLSearchParams(link.split("?")[1]))).toEqual({ longitude: 7.0134, latitude: 4.8289, zoom: 17 });
  });
});

describe("drainageFigures", () => {
  it("gives how much there is and how much isn't carrying water, flagging a problem", () => {
    const summary: DrainageSummary = { total: 1_200, needAttention: 3, partlyBlocked: 40, clear: 1_157, lastCheckedAt: "2026-10-30T09:00:00.000Z", items: [] };
    expect(drainageFigures(summary)).toEqual([
      { label: "Recorded", value: "1,200" },
      { label: "Need attention", value: "3", alert: true },
      { label: "Partly blocked", value: "40" },
      { label: "Clear", value: "1,157" },
    ]);
  });

  it("doesn't flag a place where everything is carrying water, and has nothing to show for a place with none", () => {
    expect(drainageFigures({ total: 2, needAttention: 0, partlyBlocked: 0, clear: 2, lastCheckedAt: null, items: [] })[1]).toEqual({ label: "Need attention", value: "0", alert: false });
    expect(drainageFigures({ total: 0, needAttention: 0, partlyBlocked: 0, clear: 0, lastCheckedAt: null, items: [] })).toEqual([]);
  });
});

describe("describeDrainItem", () => {
  it("says what it is, how big, where and when it was last looked at", () => {
    expect(describeDrainItem(item())).toBe(`Open drain or channel · 120 m long · 1.2 m wide · Obward 17 · checked ${formatDate("2026-10-30T09:00:00.000Z")}`);
  });

  it("leaves out the ward on a ward's own page, and any size that wasn't recorded", () => {
    expect(describeDrainItem(item({ lengthM: null, widthM: null, kind: "culvert" }), false)).toBe(`Culvert · checked ${formatDate("2026-10-30T09:00:00.000Z")}`);
  });
});
