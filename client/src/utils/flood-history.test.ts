import { describe, expect, it } from "vitest";
import type { FloodHistory, FloodHistoryItem } from "../types/field-survey.types";
import { describeHistoryItem, floodOnMapLink, historyFigures } from "./flood-history";
import { formatDate } from "./formatDate";
import { readMapView } from "./map-url";

const item = (overrides: Partial<FloodHistoryItem> = {}): FloodHistoryItem => ({
  id: "f1",
  areaM2: 103_000,
  depth: "knee",
  method: "walked",
  observedAt: "2026-10-30T09:00:00.000Z",
  receded: false,
  recededAt: null,
  wardName: "Obward 17",
  longitude: 7.0134,
  latitude: 4.8289,
  ...overrides,
});

describe("floodOnMapLink", () => {
  it("opens the main map on the flood, close enough to see it", () => {
    const link = floodOnMapLink(item());
    expect(link.startsWith("/map?")).toBe(true);
    expect(readMapView(new URLSearchParams(link.split("?")[1]))).toEqual({ longitude: 7.0134, latitude: 4.8289, zoom: 15 });
  });
});

describe("historyFigures", () => {
  it("gives how many, how many are still going, the biggest and the latest", () => {
    const history: FloodHistory = { total: 1_200, active: 3, largestAreaM2: 103_000, latestAt: "2026-10-30T09:00:00.000Z", items: [] };
    expect(historyFigures(history)).toEqual([
      { label: "Recorded", value: "1,200" },
      { label: "Still active", value: "3" },
      { label: "Largest", value: "10.3 ha" },
      { label: "Latest", value: formatDate("2026-10-30T09:00:00.000Z") },
    ]);
  });

  it("has nothing to show for a place with no floods", () => {
    expect(historyFigures({ total: 0, active: 0, largestAreaM2: 0, latestAt: null, items: [] })).toEqual([]);
  });
});

describe("describeHistoryItem", () => {
  it("says how deep, where, how it was recorded, and when it receded", () => {
    expect(describeHistoryItem(item())).toBe("Knee-deep · Obward 17 · Walked with GPS");
    expect(describeHistoryItem(item({ recededAt: "2026-11-02T09:00:00.000Z", receded: true }))).toBe(`Knee-deep · Obward 17 · Walked with GPS · receded ${formatDate("2026-11-02T09:00:00.000Z")}`);
  });

  it("leaves out the ward on a ward's own page, where every flood is in it", () => {
    expect(describeHistoryItem(item(), false)).toBe("Knee-deep · Walked with GPS");
  });

  it("leaves out what wasn't recorded", () => {
    expect(describeHistoryItem(item({ depth: null, wardName: null, method: "drawn" }))).toBe("Drawn on the map");
  });
});
