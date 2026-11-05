import type { LonLat } from "../types/admin-unit.types";
import type { SurveyMethod, SurveyTarget } from "../types/field-survey.types";
import type { SurveyDraft } from "./survey-draft";

/** Where a point came from: the device's GPS, or a tap on the map. */
export type Origin = "gps" | "tap";

/** The walk so far. `origins` runs alongside `points`; `accuracies` holds one entry per GPS point, in order. */
export interface Walk {
  points: LonLat[];
  origins: Origin[];
  accuracies: number[];
}

export const EMPTY_WALK: Walk = { points: [], origins: [], accuracies: [] };

/** A walk with one more point. A spot is a single point, so with `single` the new one replaces whatever was there. */
export function addPoint(walk: Walk, point: LonLat, origin: Origin, options: { accuracy?: number; single?: boolean } = {}): Walk {
  const base = options.single ? EMPTY_WALK : walk;
  return {
    points: [...base.points, point],
    origins: [...base.origins, origin],
    accuracies: origin === "gps" && options.accuracy !== undefined ? [...base.accuracies, options.accuracy] : base.accuracies,
  };
}

/** The walk without its last point (and, if that was a GPS point, without its accuracy). */
export function dropLast(walk: Walk): Walk {
  if (walk.points.length === 0) return walk;
  const droppedGps = walk.origins[walk.origins.length - 1] === "gps";
  return {
    points: walk.points.slice(0, -1),
    origins: walk.origins.slice(0, -1),
    accuracies: droppedGps ? walk.accuracies.slice(0, -1) : walk.accuracies,
  };
}

/** "walked" if any point came from the GPS, else "drawn" on the map. */
export function methodOf(walk: Walk): SurveyMethod {
  return walk.origins.includes("gps") ? "walked" : "drawn";
}

/** What to keep on the device: null when there is nothing to keep. */
export function draftOf(target: SurveyTarget, walk: Walk): Omit<SurveyDraft, "savedAt"> | null {
  if (walk.points.length === 0) return null;
  return { target, points: walk.points, gpsPoints: walk.origins.filter((origin) => origin === "gps").length, accuracies: walk.accuracies };
}

/** A kept draft as a walk again. Which points were walked and which tapped isn't kept, only how many were walked, first. */
export function walkFromDraft(draft: SurveyDraft): Walk {
  return {
    points: draft.points,
    origins: draft.points.map((_, index): Origin => (index < draft.gpsPoints ? "gps" : "tap")),
    accuracies: draft.accuracies,
  };
}
