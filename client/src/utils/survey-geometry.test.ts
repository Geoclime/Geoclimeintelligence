import { describe, expect, it } from "vitest";
import type { LonLat } from "../types/admin-unit.types";
import { formatArea, gpsQuality, judgeFix, medianOf, pathLengthMetres, polygonAreaMetres, thinPoints } from "./survey-geometry";

// About 0.001 degree of latitude is 111 m anywhere; of longitude at 4.8 degrees north, 110.7 m.
const SQUARE: LonLat[] = [
  [7.0, 4.8],
  [7.001, 4.8],
  [7.001, 4.801],
  [7.0, 4.801],
];

describe("pathLengthMetres", () => {
  it("adds up the legs of a walk, and closes the ring only when asked", () => {
    const open = pathLengthMetres(SQUARE);
    expect(open).toBeGreaterThan(325);
    expect(open).toBeLessThan(340);
    expect(pathLengthMetres(SQUARE, true)).toBeGreaterThan(open + 100);
  });

  it("is zero for no walk at all", () => {
    expect(pathLengthMetres([])).toBe(0);
    expect(pathLengthMetres([[7, 4.8]])).toBe(0);
  });
});

describe("polygonAreaMetres", () => {
  it("measures a block about 111 m by 111 m as about 12,300 m²", () => {
    const area = polygonAreaMetres(SQUARE);
    expect(area).toBeGreaterThan(12_000);
    expect(area).toBeLessThan(12_600);
  });

  it("gives the same area whichever way round the edge was walked, and wherever it starts", () => {
    const area = polygonAreaMetres(SQUARE);
    expect(polygonAreaMetres([...SQUARE].reverse())).toBeCloseTo(area, 0);
    expect(polygonAreaMetres([...SQUARE.slice(2), ...SQUARE.slice(0, 2)])).toBeCloseTo(area, 0);
  });

  it("has no area until there are three points", () => {
    expect(polygonAreaMetres([])).toBe(0);
    expect(polygonAreaMetres(SQUARE.slice(0, 2))).toBe(0);
  });
});

describe("formatArea", () => {
  it("picks the unit people use for the size", () => {
    expect(formatArea(850)).toBe("850 m²");
    expect(formatArea(12_345)).toBe("1.2 ha");
    expect(formatArea(3_400_000)).toBe("3.4 km²");
  });
});

describe("judgeFix", () => {
  const start: LonLat = [7.0, 4.8];

  it("keeps a walk's first good fix, and drops a vague one", () => {
    expect(judgeFix([], { point: start, accuracy: 8 })).toBe("added");
    expect(judgeFix([], { point: start, accuracy: 50 })).toBe("too-vague");
  });

  it("drops a fix that has not moved further than the device's own jitter", () => {
    const nearby: LonLat = [7.00003, 4.8]; // about 3 m east
    expect(judgeFix([start], { point: nearby, accuracy: 5 })).toBe("too-close");
    const further: LonLat = [7.0002, 4.8]; // about 22 m east
    expect(judgeFix([start], { point: further, accuracy: 5 })).toBe("added");
  });

  it("asks for more movement the vaguer the fix is", () => {
    const tenMetres: LonLat = [7.00009, 4.8];
    expect(judgeFix([start], { point: tenMetres, accuracy: 8 })).toBe("added");
    expect(judgeFix([start], { point: tenMetres, accuracy: 28 })).toBe("too-close");
  });
});

describe("thinPoints", () => {
  const path: LonLat[] = Array.from({ length: 100 }, (_, i) => [7 + i / 1000, 4.8]);

  it("leaves a short path alone", () => {
    expect(thinPoints(path, 200)).toEqual(path);
  });

  it("keeps the first and last point and the requested number", () => {
    const thinned = thinPoints(path, 10);
    expect(thinned).toHaveLength(10);
    expect(thinned[0]).toEqual(path[0]);
    expect(thinned[9]).toEqual(path[99]);
  });
});

describe("medianOf and gpsQuality", () => {
  it("takes the middle value, so one wild fix doesn't speak for the walk", () => {
    expect(medianOf([5, 6, 200])).toBe(6);
    expect(medianOf([4, 8])).toBe(6);
    expect(medianOf([])).toBeUndefined();
  });

  it("calls under 10 m good, up to 30 m fair, and worse poor", () => {
    expect([gpsQuality(6), gpsQuality(10), gpsQuality(25), gpsQuality(31)]).toEqual(["good", "good", "fair", "poor"]);
  });
});
