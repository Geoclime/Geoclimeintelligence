import { describe, expect, it } from "vitest";
import type { PublicFloodPoint } from "../types/public.types";
import { describeFlood, floodMarkerRadius, largestFloodArea } from "./public-flood";

const flood = (overrides: Partial<PublicFloodPoint> = {}): PublicFloodPoint => ({
  id: "f1",
  point: [7.012, 4.786],
  areaM2: 32_000,
  depth: "knee",
  lgaName: "Obio/Akpor",
  observedAt: "2026-10-31T09:00:00.000Z",
  ...overrides,
});

describe("floodMarkerRadius", () => {
  it("grows with the area, but never below a visible dot or above a marker that hides the map", () => {
    expect(floodMarkerRadius(10)).toBe(5);
    expect(floodMarkerRadius(10_000)).toBeCloseTo(9.4, 1);
    expect(floodMarkerRadius(5_000_000)).toBe(12);
    expect(floodMarkerRadius(50_000_000)).toBe(12);
    expect(floodMarkerRadius(100)).toBeLessThan(floodMarkerRadius(100_000));
  });

  it("copes with an area of nothing, rather than shrinking to nothing", () => {
    expect(floodMarkerRadius(0)).toBe(5);
  });
});

describe("describeFlood", () => {
  it("says how big, how deep and where", () => {
    expect(describeFlood(flood())).toBe("Flood recorded on the ground: 3.2 ha, knee-deep, in Obio/Akpor");
  });

  it("leaves out what wasn't recorded", () => {
    expect(describeFlood(flood({ depth: null, lgaName: null, areaM2: 850 }))).toBe("Flood recorded on the ground: 850 m²");
  });
});

describe("largestFloodArea", () => {
  it("is the biggest of them, and 0 for none", () => {
    expect(largestFloodArea([flood({ areaM2: 500 }), flood({ areaM2: 90_000 }), flood({ areaM2: 4_000 })])).toBe(90_000);
    expect(largestFloodArea([])).toBe(0);
  });
});
