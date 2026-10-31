import { describe, expect, it } from "vitest";
import { bearingDegrees, boundsAround, compassPoint, describeOffset, distanceMetres, formatDistance } from "./geo-distance";

describe("distanceMetres", () => {
  it("is about 111 km for one degree of latitude", () => {
    expect(distanceMetres([7, 4], [7, 5])).toBeGreaterThan(110_500);
    expect(distanceMetres([7, 4], [7, 5])).toBeLessThan(111_500);
  });

  it("shrinks east to west with the latitude, and is zero for the same place", () => {
    expect(distanceMetres([7.0134, 4.7774], [7.0234, 4.7774])).toBeGreaterThan(1_080);
    expect(distanceMetres([7.0134, 4.7774], [7.0234, 4.7774])).toBeLessThan(1_130);
    expect(distanceMetres([7, 4], [7, 4])).toBe(0);
  });
});

describe("bearingDegrees and compassPoint", () => {
  it("points the way", () => {
    expect(bearingDegrees([7, 5], [7, 6])).toBeCloseTo(0, 0);
    expect(bearingDegrees([7, 5], [8, 5])).toBeCloseTo(90, 0);
    expect(bearingDegrees([7, 5], [7, 4])).toBeCloseTo(180, 0);
    expect(bearingDegrees([7, 5], [6, 5])).toBeCloseTo(270, 0);
  });

  it("names the eight points, wrapping round at north", () => {
    expect(compassPoint(0)).toBe("north");
    expect(compassPoint(44)).toBe("north-east");
    expect(compassPoint(180)).toBe("south");
    expect(compassPoint(271)).toBe("west");
    expect(compassPoint(359)).toBe("north");
  });
});

describe("formatDistance", () => {
  it("rounds to what a person can use", () => {
    expect(formatDistance(3)).toBe("5 m");
    expect(formatDistance(47)).toBe("45 m");
    expect(formatDistance(853)).toBe("850 m");
    expect(formatDistance(1_234)).toBe("1.2 km");
    expect(formatDistance(14_600)).toBe("15 km");
  });
});

describe("describeOffset", () => {
  it("says which way the place is from where you stand", () => {
    expect(describeOffset([7.0234, 4.7774], [7.0134, 4.7774])).toBe("1.1 km west of you");
    expect(describeOffset([7, 5], [7, 5.0001])).toBe("You are at this spot");
  });
});

describe("boundsAround", () => {
  it("covers every point", () => {
    expect(boundsAround([[7, 5], [7.5, 5.5]])).toEqual([7, 5, 7.5, 5.5]);
  });

  it("never gets smaller than the minimum span, so close points don't zoom to the rooftops", () => {
    const [west, south, east, north] = boundsAround([[7.0134, 4.7774]]);
    expect(east - west).toBeCloseTo(0.004, 6);
    expect(north - south).toBeCloseTo(0.004, 6);
  });
});
