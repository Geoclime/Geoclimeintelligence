import type { LonLat } from "../../common/geo/geo";
import { WATER_DEPTHS } from "../flood-reports/flood-report.types";

/**
 * The rules of field survey: a flood extent walked or drawn on the map, and the drains that carry
 * (or fail to carry) the water away. Constants and pure functions only, no database: the
 * repositories turn these numbers into SQL, and the client mirrors the lists
 * (client/src/types/field-survey.types.ts).
 */

/** The same five depths a community flood report uses, so the two read alike. */
export const FLOOD_DEPTHS = WATER_DEPTHS;
export type FloodDepth = (typeof FLOOD_DEPTHS)[number];

/** How a shape was captured: GPS fixes while walking, or points tapped on the map. */
export const SURVEY_METHODS = ["walked", "drawn"] as const;
export type SurveyMethod = (typeof SURVEY_METHODS)[number];

export const DRAINAGE_KINDS = ["open_drain", "covered_drain", "culvert", "outfall", "inlet", "retention_pond"] as const;
export type DrainageKind = (typeof DRAINAGE_KINDS)[number];

/** Drains that run along the ground are walked as a line; the rest are one spot. */
const LINE_KINDS: readonly DrainageKind[] = ["open_drain", "covered_drain"];

export function isLineKind(kind: DrainageKind): boolean {
  return LINE_KINDS.includes(kind);
}

/** Best to worst: what an inspection found. */
export const DRAINAGE_CONDITIONS = ["clear", "partly_blocked", "blocked", "overflowing", "damaged"] as const;
export type DrainageCondition = (typeof DRAINAGE_CONDITIONS)[number];

/** The conditions that mean water is not getting through: what a flood should be pointed at. */
const NEEDS_ATTENTION: readonly DrainageCondition[] = ["blocked", "overflowing", "damaged"];

export function needsAttention(condition: DrainageCondition): boolean {
  return NEEDS_ATTENTION.includes(condition);
}

export const SURVEY_LIMITS = {
  /** A flood outline needs at least a triangle. */
  extentMinPoints: 3,
  /** A long walk, thinned by the client, is well under this. */
  maxPoints: 2_000,
  /** Ten square metres is a puddle; fifty square kilometres is a GPS jump, not a flood. */
  extentAreaM2: { min: 10, max: 50_000_000 },
  /** A drain shorter than this is a spot, not a line; longer is a river. */
  drainLengthM: { min: 2, max: 50_000 },
  noteLength: 500,
  nameLength: 120,
  /** The widest and deepest a drain is plausibly measured at, in metres. */
  maxDrainSizeM: 100,
  /** A drain this close to a flood is listed beside it. */
  nearbyDrainMetres: 150,
  /** What one map reply may hold, per layer. */
  featureCap: 2_000,
  /** Names listed in a flood's impact summary. */
  impactListMax: 20,
  /** A receded flood stays on the map this long, then drops off it. */
  recededVisibleDays: 7,
  /**
   * A flood is on the public alert map this long after it was recorded, unless it was marked receded
   * sooner. A flood nobody went back to must not sit on a page that people read as "now".
   */
  publicFloodDays: 3,
  publicFloodLimit: 200,
} as const;

/** How many different places a list of points names (two fixes at one spot are one place). */
export function distinctPoints(points: readonly LonLat[]): number {
  return new Set(points.map(([lon, lat]) => `${lon.toFixed(7)},${lat.toFixed(7)}`)).size;
}

/** The middle of some points: where a flood or drain is "at" for finding its ward. */
export function meanPoint(points: readonly LonLat[]): LonLat {
  const sum = points.reduce<LonLat>((total, [lon, lat]) => [total[0] + lon, total[1] + lat], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}
