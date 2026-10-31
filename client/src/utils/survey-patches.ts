import type { LonLat } from "../types/admin-unit.types";
import type {
  Drainage,
  DrainageCondition,
  DrainageFeatureCollection,
  FloodExtent,
  FloodExtentFeatureCollection,
  SelectedSurvey,
} from "../types/field-survey.types";
import { isLineKind } from "./field-survey";

type FloodFeature = FloodExtentFeatureCollection["features"][number];
type DrainFeature = DrainageFeatureCollection["features"][number];

/**
 * What just changed on the map, known the moment the server said yes: a flood marked receded, put back or
 * deleted, a drain re-inspected or deleted, a flood or drain saved. Drawn at once, so the colour never waits
 * on the round trip to fetch the layer again; the fetch that follows then confirms it.
 */
export type SurveyChange =
  | { kind: "flood-state"; id: string; receded: boolean }
  | { kind: "flood-removed"; id: string }
  | { kind: "flood-added"; feature: FloodFeature }
  | { kind: "drain-condition"; id: string; condition: DrainageCondition }
  | { kind: "drain-removed"; id: string }
  | { kind: "drain-added"; feature: DrainFeature };

/** A change and when it happened (milliseconds since 1970), so it is dropped once newer data has arrived. */
export type SurveyPatch = SurveyChange & { at: number };

/** The most patches kept: a person can't change more than this before the layer has been fetched again. */
export const MAX_PATCHES = 50;

/** The deletion of the flood or drain that was open in a popup. */
export function removedChange(selected: SelectedSurvey): SurveyChange {
  return selected.type === "flood" ? { kind: "flood-removed", id: selected.properties.id } : { kind: "drain-removed", id: selected.properties.id };
}

/** A flood just saved, drawn from the points it was walked with (the server repairs the shape it stores; the fetch that follows replaces this). */
export function floodAdded(extent: FloodExtent, points: readonly LonLat[]): SurveyChange {
  const { id, areaM2, depth, method, observedAt, lgaId, wardId } = extent;
  return {
    kind: "flood-added",
    feature: {
      type: "Feature",
      id,
      geometry: { type: "MultiPolygon", coordinates: [[[...points.map((point) => [...point]), [...points[0]!]]]] },
      properties: { id, areaM2, depth, method, receded: false, observedAt, lgaId, wardId },
    },
  };
}

/** A drain just saved: a line along the walk for a drain, a dot for a culvert, outfall, inlet or pond. */
export function drainAdded(drain: Drainage, points: readonly LonLat[]): SurveyChange {
  const { id, kind, condition, name, widthM, depthM, lengthM, note, lastCheckedAt, lgaId, wardId } = drain;
  return {
    kind: "drain-added",
    feature: {
      type: "Feature",
      id,
      geometry: isLineKind(kind) ? { type: "LineString", coordinates: points.map((point) => [...point]) } : { type: "Point", coordinates: [...points[0]!] },
      properties: { id, kind, condition, name, widthM, depthM, lengthM, note, lastCheckedAt, lgaId, wardId },
    },
  };
}

/**
 * Only patches newer than the request that produced the data apply: older ones are already in it, and
 * would wrongly override a change made since by someone else. \`startedAt\` is when that request began.
 */
const newer = (patches: readonly SurveyPatch[], startedAt: number) => patches.filter((patch) => patch.at > startedAt);

export function patchFloods(data: FloodExtentFeatureCollection | null, startedAt: number, patches: readonly SurveyPatch[]): FloodExtentFeatureCollection | null {
  const live = newer(patches, startedAt);
  if (!data || live.length === 0) return data;
  let features = data.features;
  for (const patch of live) {
    if (patch.kind === "flood-state") {
      features = features.map((feature) => (feature.properties.id === patch.id ? { ...feature, properties: { ...feature.properties, receded: patch.receded } } : feature));
    } else if (patch.kind === "flood-removed") {
      features = features.filter((feature) => feature.properties.id !== patch.id);
    } else if (patch.kind === "flood-added" && !features.some((feature) => feature.properties.id === patch.feature.properties.id)) {
      features = [...features, patch.feature];
    }
  }
  return { ...data, features };
}

export function patchDrains(data: DrainageFeatureCollection | null, startedAt: number, patches: readonly SurveyPatch[]): DrainageFeatureCollection | null {
  const live = newer(patches, startedAt);
  if (!data || live.length === 0) return data;
  let features = data.features;
  for (const patch of live) {
    if (patch.kind === "drain-condition") {
      const checked = new Date(patch.at).toISOString();
      features = features.map((feature) =>
        feature.properties.id === patch.id ? { ...feature, properties: { ...feature.properties, condition: patch.condition, lastCheckedAt: checked } } : feature,
      );
    } else if (patch.kind === "drain-removed") {
      features = features.filter((feature) => feature.properties.id !== patch.id);
    } else if (patch.kind === "drain-added" && !features.some((feature) => feature.properties.id === patch.feature.properties.id)) {
      features = [...features, patch.feature];
    }
  }
  return { ...data, features };
}
