import type { FloodAheadWarning, NearbyFlood } from "./flood-ahead.types";

/** The smallest and largest distance a person may ask to be warned at. */
export const WARN_RADIUS_M = { min: 500, max: 10_000 } as const;

/**
 * The distance bands a warning is given at as someone comes closer, widest first. A flood within the
 * chosen distance is warned about when the person first comes within it, and again at each smaller band
 * below it: "3 km ahead", then "2 km", then "1 km". Bands wider than the chosen distance are not used.
 */
export const WARN_TIERS_M = [5_000, 3_000, 2_000, 1_000, 500, 250, 100] as const;

/** A position less sure than this is not used: a laptop's guess from its network can be kilometres out, and a false warning is worse than none. */
export const MAX_ACCURACY_M = 1_000;

/** Updates from one connection closer together than this are ignored, so a page can't hammer the database. */
export const MIN_UPDATE_GAP_MS = 3_000;

/** A published community report is "flooded now" for this long after it was sent. */
export const REPORT_FRESH_HOURS = 24;

/**
 * A flood a responder recorded is "flooded now" until someone marks it receded, as the map draws it
 * (magenta, "Flood, as recorded"), however long ago it was recorded: floods here can last weeks. This is
 * only a safety cap, so a record nobody ever closed doesn't warn people for ever. (The public alert map
 * keeps only the last few days, to stay current, which is why it is not the rule here: it skipped floods
 * the map itself still showed as flooded.)
 */
export const FLOOD_STALE_DAYS = 30;

/**
 * A flood stays remembered as warned about until the person is this much farther than the chosen
 * distance from it, so wandering along the edge of the distance doesn't repeat the same warning.
 */
export const FORGET_MARGIN_M = 300;

/** The most floods looked at per update. */
export const MAX_NEARBY = 25;

/** The bands in use for a chosen distance, widest first: the distance itself, then each smaller band. */
export function tiersFor(radiusM: number): number[] {
  return [radiusM, ...WARN_TIERS_M.filter((tier) => tier < radiusM)];
}

/** The smallest band of `tiers` (widest first) that a distance is within. */
export function tierOf(distanceM: number, tiers: number[]): number {
  let found = tiers[0] ?? distanceM;
  for (const tier of tiers) if (distanceM <= tier) found = tier;
  return found;
}

export interface WarningPlan {
  /** Floods the person has just come within a new band of, nearest first. */
  warnings: FloodAheadWarning[];
  /** What to remember for the next update. */
  warned: Map<string, number>;
  /** Floods within the chosen distance, and the nearest one's distance (null if none). */
  floodsNearby: number;
  nearestM: number | null;
}

/**
 * Decides what to tell someone now. A flood is warned about when it is within the chosen distance and
 * either new, or in a smaller band than any it was warned at before, so coming closer warns again and
 * moving away or standing still doesn't. `nearby` should reach FORGET_MARGIN_M beyond the chosen
 * distance, so a flood just outside it is remembered rather than forgotten and warned about afresh.
 */
export function planWarnings(nearby: NearbyFlood[], radiusM: number, warned: Map<string, number>): WarningPlan {
  const tiers = tiersFor(radiusM);
  const next = new Map<string, number>();
  const warnings: FloodAheadWarning[] = [];
  let floodsNearby = 0;
  let nearestM: number | null = null;

  for (const flood of nearby) {
    const key = `${flood.kind}:${flood.id}`;
    const before = warned.get(key);
    if (flood.distanceM > radiusM) {
      if (before !== undefined) next.set(key, before);
      continue;
    }
    floodsNearby += 1;
    nearestM = nearestM === null ? flood.distanceM : Math.min(nearestM, flood.distanceM);
    const tier = tierOf(flood.distanceM, tiers);
    if (before === undefined || tier < before) warnings.push({ ...flood, tierM: tier });
    next.set(key, before === undefined ? tier : Math.min(before, tier));
  }

  warnings.sort((a, b) => a.distanceM - b.distanceM);
  return { warnings, warned: next, floodsNearby, nearestM };
}
