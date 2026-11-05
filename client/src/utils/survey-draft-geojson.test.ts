import { describe, expect, it } from "vitest";
import type { LonLat } from "../types/admin-unit.types";
import { surveyDraftGeoJson } from "./survey-draft-geojson";

const A: LonLat = [7, 4.8];
const B: LonLat = [7.001, 4.8];
const C: LonLat = [7.001, 4.801];
const types = (collection: ReturnType<typeof surveyDraftGeoJson>) => collection.features.map((f) => `${f.properties?.role}:${f.geometry.type}`);

describe("surveyDraftGeoJson", () => {
  it("draws nothing before the walk has a point", () => {
    expect(surveyDraftGeoJson("flood", [], null).features).toEqual([]);
    expect(surveyDraftGeoJson(null, [], null).features).toEqual([]);
  });

  it("shows a single point as a dot, and two as a path with a dot each", () => {
    expect(types(surveyDraftGeoJson("flood", [A], null))).toEqual(["vertex:Point"]);
    expect(types(surveyDraftGeoJson("flood", [A, B], null))).toEqual(["shape:LineString", "vertex:Point", "vertex:Point"]);
  });

  it("closes a flood into a ring once it has three corners, repeating the first corner at the end", () => {
    const shape = surveyDraftGeoJson("flood", [A, B, C], null).features[0]!;
    expect(shape.geometry).toEqual({ type: "Polygon", coordinates: [[A, B, C, A]] });
  });

  it("keeps a drain a path however many points it has", () => {
    expect(surveyDraftGeoJson("drain-line", [A, B, C], null).features[0]!.geometry.type).toBe("LineString");
  });

  it("adds where you stand when it is known", () => {
    expect(types(surveyDraftGeoJson("flood", [A], [7.0001, 4.8]))).toEqual(["vertex:Point", "me:Point"]);
  });
});
