import { describe, expect, it } from "vitest";
import type { LonLat } from "../types/admin-unit.types";
import type { Drainage, DrainageFeatureCollection, FloodExtent, FloodExtentFeatureCollection, SelectedSurvey } from "../types/field-survey.types";
import { drainAdded, floodAdded, patchDrains, patchFloods, removedChange, type SurveyChange, type SurveyPatch } from "./survey-patches";

const ring: LonLat[] = [[7, 4.8], [7.001, 4.8], [7.001, 4.801]];

const floodFeature = (id: string, receded = false) => ({
  type: "Feature" as const,
  id,
  geometry: { type: "MultiPolygon" as const, coordinates: [[[[7, 4.8], [7.001, 4.8], [7.001, 4.801], [7, 4.8]]]] },
  properties: { id, areaM2: 12_000, depth: null, method: "walked" as const, receded, observedAt: "2026-10-31T09:00:00.000Z", lgaId: null, wardId: null },
});
const floods = (...features: ReturnType<typeof floodFeature>[]): FloodExtentFeatureCollection => ({ type: "FeatureCollection", features, truncated: false });

const drainFeature = (id: string, condition: "clear" | "blocked" = "blocked") => ({
  type: "Feature" as const,
  id,
  geometry: { type: "Point" as const, coordinates: [7, 4.8] },
  properties: { id, kind: "culvert" as const, condition, name: null, widthM: null, depthM: null, lengthM: null, note: null, lastCheckedAt: "2026-10-30T09:00:00.000Z", lgaId: null, wardId: null },
});
const drains = (...features: ReturnType<typeof drainFeature>[]): DrainageFeatureCollection => ({ type: "FeatureCollection", features, truncated: false });

const at = (change: SurveyChange, time: number): SurveyPatch => ({ ...change, at: time });
const START = 1_000;

describe("patchFloods", () => {
  it("turns a flood grey the moment it is marked receded, and back to active when put back", () => {
    const data = floods(floodFeature("f1"), floodFeature("f2"));
    const receded = patchFloods(data, START, [at({ kind: "flood-state", id: "f1", receded: true }, START + 10)])!;
    expect(receded.features.map((f) => [f.properties.id, f.properties.receded])).toEqual([["f1", true], ["f2", false]]);

    const back = patchFloods(floods(floodFeature("f1", true)), START, [at({ kind: "flood-state", id: "f1", receded: false }, START + 10)])!;
    expect(back.features[0]!.properties.receded).toBe(false);
  });

  it("applies several changes in the order they were made", () => {
    const patches = [at({ kind: "flood-state", id: "f1", receded: true }, START + 1), at({ kind: "flood-state", id: "f1", receded: false }, START + 2)];
    expect(patchFloods(floods(floodFeature("f1")), START, patches)!.features[0]!.properties.receded).toBe(false);
  });

  it("removes a deleted flood, and adds a saved one once", () => {
    const data = floods(floodFeature("f1"));
    expect(patchFloods(data, START, [at({ kind: "flood-removed", id: "f1" }, START + 5)])!.features).toEqual([]);

    const added = at({ kind: "flood-added", feature: floodFeature("f9") }, START + 5);
    expect(patchFloods(data, START, [added])!.features.map((f) => f.properties.id)).toEqual(["f1", "f9"]);
    expect(patchFloods(floods(floodFeature("f9")), START, [added])!.features).toHaveLength(1);
  });

  it("ignores a change that is already in the data, so newer facts from elsewhere aren't overridden", () => {
    const data = floods(floodFeature("f1"));
    const old = at({ kind: "flood-state", id: "f1", receded: true }, START - 5);
    expect(patchFloods(data, START, [old])).toBe(data);
    expect(patchFloods(data, START, [at({ kind: "flood-state", id: "f1", receded: true }, START)])).toBe(data);
  });

  it("leaves nothing to patch alone, and never makes data up", () => {
    expect(patchFloods(null, START, [at({ kind: "flood-removed", id: "f1" }, START + 1)])).toBeNull();
    const data = floods(floodFeature("f1"));
    expect(patchFloods(data, START, [])).toBe(data);
    expect(patchFloods(data, START, [at({ kind: "drain-removed", id: "d1" }, START + 1)])!.features).toHaveLength(1);
  });
});

describe("patchDrains", () => {
  it("changes a drain's colour at once when it is re-inspected, and says it was checked just now", () => {
    const patched = patchDrains(drains(drainFeature("d1")), START, [at({ kind: "drain-condition", id: "d1", condition: "clear" }, START + 500)])!;
    expect(patched.features[0]!.properties).toMatchObject({ condition: "clear", lastCheckedAt: new Date(START + 500).toISOString() });
  });

  it("removes a deleted drain, and adds a saved one", () => {
    const data = drains(drainFeature("d1"));
    expect(patchDrains(data, START, [at({ kind: "drain-removed", id: "d1" }, START + 1)])!.features).toEqual([]);
    expect(patchDrains(data, START, [at({ kind: "drain-added", feature: drainFeature("d2") }, START + 1)])!.features).toHaveLength(2);
  });
});

describe("building a change from what was saved", () => {
  const extent = { id: "f1", areaM2: 12_300, depth: "knee", method: "walked", observedAt: "2026-10-31T09:00:00.000Z", lgaId: "l1", wardId: "w1" } as FloodExtent;

  it("draws a saved flood as a closed ring through the walked points, filed under its LGA and ward", () => {
    const change = floodAdded(extent, ring);
    expect(change.kind === "flood-added" && change.feature.geometry.coordinates[0]![0]).toEqual([[7, 4.8], [7.001, 4.8], [7.001, 4.801], [7, 4.8]]);
    expect(change.kind === "flood-added" && change.feature.properties).toMatchObject({ id: "f1", receded: false, lgaId: "l1", wardId: "w1" });
  });

  it("draws a saved drain as a line, and a culvert as a dot", () => {
    const drain = (kind: Drainage["kind"]) => ({ id: "d1", kind, condition: "blocked", name: null, widthM: null, depthM: null, lengthM: 120, note: null, lastCheckedAt: "2026-10-31T09:00:00.000Z" }) as Drainage;
    const line = drainAdded(drain("open_drain"), ring);
    const dot = drainAdded(drain("culvert"), ring);
    expect(line.kind === "drain-added" && line.feature.geometry.type).toBe("LineString");
    expect(dot.kind === "drain-added" && dot.feature.geometry).toEqual({ type: "Point", coordinates: [7, 4.8] });
  });

  it("names the flood or drain that was deleted", () => {
    const flood: SelectedSurvey = { type: "flood", point: [7, 4.8], properties: floodFeature("f1").properties };
    const drain: SelectedSurvey = { type: "drain", point: [7, 4.8], properties: drainFeature("d1").properties };
    expect(removedChange(flood)).toEqual({ kind: "flood-removed", id: "f1" });
    expect(removedChange(drain)).toEqual({ kind: "drain-removed", id: "d1" });
  });
});
