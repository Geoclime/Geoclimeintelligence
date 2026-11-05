import { describe, expect, it } from "vitest";
import type { ClickedFeature } from "../types/map-layer.types";
import { surveyFeatureIn } from "./survey-click";

const CLICK: [number, number] = [7.0005, 4.8005];
const feature = (layerId: string, properties: Record<string, unknown>, coordinates: [number, number] | null = null): ClickedFeature => ({ layerId, properties, coordinates });

const flood = feature("flood-extent-fill", { id: "f1", areaM2: 12_500, depth: "knee", method: "walked", receded: false, observedAt: "2026-10-31T09:00:00.000Z" });
const drain = feature("drainage-hit", { id: "d1", kind: "open_drain", condition: "blocked", name: "Aba Road drain", widthM: 1.2, depthM: null, lengthM: 120, note: "Silted", lastCheckedAt: "2026-10-30T09:00:00.000Z" });

describe("surveyFeatureIn", () => {
  it("opens a flood at the spot that was clicked", () => {
    expect(surveyFeatureIn([flood], CLICK)).toEqual({
      type: "flood",
      point: CLICK,
      properties: { id: "f1", areaM2: 12_500, depth: "knee", method: "walked", receded: false, observedAt: "2026-10-31T09:00:00.000Z", lgaId: null, wardId: null },
    });
  });

  it("opens a drain, reading a missing size as none", () => {
    const opened = surveyFeatureIn([drain], CLICK);
    expect(opened).toMatchObject({ type: "drain", point: CLICK, properties: { id: "d1", kind: "open_drain", condition: "blocked", name: "Aba Road drain", widthM: 1.2, depthM: null } });
  });

  it("opens a drain's own spot at that spot, rather than where the tap landed", () => {
    const spot = feature("drainage-points", { id: "d2", kind: "culvert", condition: "clear" }, [7.0012, 4.8003]);
    expect(surveyFeatureIn([spot], CLICK)).toMatchObject({ type: "drain", point: [7.0012, 4.8003] });
  });

  it("prefers the drain when a drain runs through a flood: it is the smaller target", () => {
    expect(surveyFeatureIn([flood, drain], CLICK)?.type).toBe("drain");
  });

  it("ignores other layers, and features that don't look right", () => {
    expect(surveyFeatureIn([], CLICK)).toBeNull();
    expect(surveyFeatureIn([feature("lga-fill", { id: "x" })], CLICK)).toBeNull();
    expect(surveyFeatureIn([feature("drainage-hit", { id: "d1", kind: "moat", condition: "clear" })], CLICK)).toBeNull();
    expect(surveyFeatureIn([feature("flood-extent-fill", { areaM2: 10 })], CLICK)).toBeNull();
  });

  it("reads an unknown depth as none and a flood that has receded as receded", () => {
    const odd = feature("flood-extent-fill", { id: "f2", areaM2: 50, depth: "ocean", receded: true });
    expect(surveyFeatureIn([odd], CLICK)).toMatchObject({ properties: { depth: null, receded: true } });
  });
});
