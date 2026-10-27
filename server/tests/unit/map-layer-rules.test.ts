import { describe, expect, it } from "vitest";
import {
  LAYER_FEATURE_LIMIT,
  MINOR_ROAD_RANK,
  isWaterClass,
  maxRoadRank,
  roadClassRank,
  simplifyTolerance,
  waterClassesAtZoom,
} from "../../src/modules/map-layers/layer-rules";

describe("road ranks", () => {
  it("ranks the main roads first and anything unlisted as minor", () => {
    expect(roadClassRank("trunk")).toBe(1);
    expect(roadClassRank("primary_link")).toBe(2);
    expect(roadClassRank("secondary")).toBe(3);
    expect(roadClassRank("residential")).toBe(6);
    expect(roadClassRank("service")).toBe(7);
    expect(roadClassRank("footway")).toBe(MINOR_ROAD_RANK);
    expect(roadClassRank("something_new")).toBe(MINOR_ROAD_RANK);
  });

  it("ignores case and stray spaces in the tag", () => {
    expect(roadClassRank(" Primary ")).toBe(2);
  });
});

describe("what the roads layer shows at each zoom", () => {
  it("shows only trunk and primary roads for a whole-state view", () => {
    expect(maxRoadRank(7)).toBe(2);
    expect(maxRoadRank(8.9)).toBe(2);
  });

  it("adds smaller roads step by step as you zoom in", () => {
    expect([9, 10, 11, 12, 13, 14].map(maxRoadRank)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(maxRoadRank(20)).toBe(MINOR_ROAD_RANK);
  });

  it("shows everything when no zoom is given", () => {
    expect(maxRoadRank(undefined)).toBe(MINOR_ROAD_RANK);
  });
});

describe("what the waterways layer shows at each zoom", () => {
  it("starts with rivers, then adds creeks, then the rest", () => {
    expect(waterClassesAtZoom(8)).toEqual(["river"]);
    expect(waterClassesAtZoom(9)).toEqual(["river", "creek"]);
    expect(waterClassesAtZoom(11)).toEqual(["river", "creek", "other"]);
    expect(waterClassesAtZoom(undefined)).toEqual(["river", "creek", "other"]);
  });

  it("knows the three classes the database accepts", () => {
    expect(isWaterClass("creek")).toBe(true);
    expect(isWaterClass("stream")).toBe(false);
  });
});

describe("limits and simplification", () => {
  it("caps every layer", () => {
    expect(LAYER_FEATURE_LIMIT.roads).toBeGreaterThan(0);
    expect(LAYER_FEATURE_LIMIT.settlements).toBeGreaterThan(1149);
  });

  it("simplifies to about one pixel, and not at all without a zoom", () => {
    expect(simplifyTolerance(undefined)).toBe(0);
    expect(simplifyTolerance(8)).toBeCloseTo(180 / (512 * 256), 10);
    expect(simplifyTolerance(12)).toBeLessThan(simplifyTolerance(8));
  });
});
