import type { LonLat } from "../types/admin-unit.types";
import { WATER_DEPTHS, type WaterDepth } from "../types/flood-report.types";
import { DRAINAGE_CONDITIONS, DRAINAGE_KINDS, type DrainageCondition, type DrainageKind, type SelectedSurvey } from "../types/field-survey.types";
import type { ClickedFeature } from "../types/map-layer.types";

const FLOOD_LAYER = "flood-extent-fill";
const DRAIN_LAYERS = ["drainage-hit", "drainage-points"];

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const oneOf = <T extends string>(list: readonly T[], value: unknown): T | null => (typeof value === "string" && (list as readonly string[]).includes(value) ? (value as T) : null);

/**
 * The flood or drain under a click, if there is one, as the popup needs it. Properties come back from
 * the map as plain values, so each is checked rather than trusted: a feature that doesn't look right
 * is no feature. A drain wins over a flood when both are there, because a drain is the smaller target.
 */
export function surveyFeatureIn(features: readonly ClickedFeature[], clicked: LonLat): SelectedSurvey | null {
  for (const feature of features.filter((item) => DRAIN_LAYERS.includes(item.layerId))) {
    const p = feature.properties;
    const id = text(p.id);
    const kind: DrainageKind | null = oneOf(DRAINAGE_KINDS, p.kind);
    const condition: DrainageCondition | null = oneOf(DRAINAGE_CONDITIONS, p.condition);
    if (!id || !kind || !condition) continue;
    return {
      type: "drain",
      point: feature.coordinates ?? clicked,
      properties: {
        id,
        kind,
        condition,
        name: text(p.name),
        widthM: num(p.widthM),
        depthM: num(p.depthM),
        lengthM: num(p.lengthM),
        note: text(p.note),
        lastCheckedAt: text(p.lastCheckedAt) ?? "",
      },
    };
  }

  for (const feature of features.filter((item) => item.layerId === FLOOD_LAYER)) {
    const p = feature.properties;
    const id = text(p.id);
    const areaM2 = num(p.areaM2);
    if (!id || areaM2 === null) continue;
    const depth: WaterDepth | null = oneOf(WATER_DEPTHS, p.depth);
    return {
      type: "flood",
      point: clicked,
      properties: {
        id,
        areaM2,
        depth,
        method: p.method === "drawn" ? "drawn" : "walked",
        receded: p.receded === true,
        observedAt: text(p.observedAt) ?? "",
        lgaId: text(p.lgaId),
        wardId: text(p.wardId),
      },
    };
  }
  return null;
}
