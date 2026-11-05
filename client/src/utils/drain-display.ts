import type { LineString, Point } from "geojson";
import type { DrainageCondition, DrainageFeatureCollection, DrainageFeatureProperties } from "../types/field-survey.types";
import type { ConditionTone } from "./field-survey";
import { CONDITION_INFO } from "./field-survey";

/** A drain nobody has looked at for this long is drawn faded: its colour is a memory, not a report. */
export const DRAIN_STALE_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when the last check is older than DRAIN_STALE_DAYS (or unreadable, which is no better). */
export function isStaleCheck(lastCheckedAt: string, now: number = Date.now()): boolean {
  const checked = Date.parse(lastCheckedAt);
  return !Number.isFinite(checked) || now - checked > DRAIN_STALE_DAYS * DAY_MS;
}

export function conditionTone(condition: DrainageCondition): ConditionTone {
  return CONDITION_INFO[condition].tone;
}

/** What the map paints a drain by, on top of what the server sent. */
export interface DrainDisplayProperties extends DrainageFeatureProperties {
  tone: ConditionTone;
  stale: boolean;
  /** The line's points run the way the water flows, so arrows can follow them. */
  flowKnown: boolean;
}

/**
 * The drains as the map draws them: each with its colour tone, whether its last check is stale, and,
 * when someone recorded which way the water flows, its line turned to run that way (a drain walked
 * upstream is reversed), so the arrows drawn along it point downstream.
 */
export function drainsForDisplay(collection: DrainageFeatureCollection | null, now: number = Date.now()) {
  if (!collection) return null;
  return {
    ...collection,
    features: collection.features.map((feature) => {
      const { properties } = feature;
      const flow = properties.flowDirection ?? null;
      const geometry: Point | LineString =
        flow === "against_line" && feature.geometry.type === "LineString"
          ? { type: "LineString", coordinates: [...feature.geometry.coordinates].reverse() }
          : feature.geometry;
      const display: DrainDisplayProperties = {
        ...properties,
        tone: conditionTone(properties.condition),
        stale: isStaleCheck(properties.lastCheckedAt, now),
        flowKnown: flow === "with_line" || flow === "against_line",
      };
      return { ...feature, geometry, properties: display };
    }),
  };
}
