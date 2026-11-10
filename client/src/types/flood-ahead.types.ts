/** Mirrors server/src/modules/flood-ahead/flood-ahead.types.ts. If one changes, both change in the same PR. */

export type FloodAheadKind = "flood" | "report";

/** A flood the person has just come within a new distance of. */
export interface FloodAheadWarning {
  kind: FloodAheadKind;
  id: string;
  /** Metres to the nearest edge of the flood; 0 when inside it. */
  distanceM: number;
  /** Compass bearing from the person to the flood (0 = north); null when inside it. */
  bearingDeg: number | null;
  /** ankle, knee, waist, chest or impassable; null if unknown. */
  depth: string | null;
  place: string | null;
  /** [longitude, latitude] of the nearest point, rounded to about 100 m. */
  point: [number, number];
  /** The distance band just entered, in metres. */
  tierM: number;
}

/** The server's answer to every position sent, so the screen can say what was checked. */
export interface FloodAheadAck {
  ok: boolean;
  reason?: "invalid" | "too-fast" | "inaccurate" | "unavailable";
  floodsNearby?: number;
  nearestM?: number | null;
}

/** Preset distances in metres, plus bounds for any custom distance (0.5 km to 500 km). */
export const WARN_DISTANCES_M = [1_000, 2_000, 3_000, 5_000, 10_000] as const;
export const DEFAULT_WARN_DISTANCE_M = 3_000;
export const WARN_RADIUS_M = { min: 500, max: 500_000 } as const;
export const MAX_WARN_DISTANCE_KM = WARN_RADIUS_M.max / 1_000;
