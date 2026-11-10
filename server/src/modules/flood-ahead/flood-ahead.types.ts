/** "A flood" is one a responder recorded on the ground; "a report" is a published community report. */
export type FloodAheadKind = "flood" | "report";

/** One flooded place near a position, as the database measured it. */
export interface NearbyFlood {
  kind: FloodAheadKind;
  id: string;
  /** Metres from the person to the nearest edge of the flood; 0 when they are inside it. */
  distanceM: number;
  /** Compass bearing (0 = north, 90 = east) from the person towards the nearest point; null when inside. */
  bearingDeg: number | null;
  /** How deep the water is, in the words reports use (ankle, knee, waist, chest, impassable); null if unknown. */
  depth: string | null;
  /** The ward, else the LGA, it is in. */
  place: string | null;
  /** [longitude, latitude] of the nearest point, rounded to about 100 m as the public map's points are. */
  point: [number, number];
}

/** A flood the person has just come within a new distance of. */
export interface FloodAheadWarning extends NearbyFlood {
  /** The distance band just entered: "within 1000 m". Smaller means closer. */
  tierM: number;
}

/** What a browser sends about where it is. Used for one check, then forgotten. */
export interface FloodAheadUpdate {
  lat: number;
  lon: number;
  /** How far from the person to warn about floods, in metres. */
  radiusM: number;
  /** How sure the device is of the position, in metres. */
  accuracy?: number;
}

/** The answer to the sender of every update, so the screen can say what was checked. */
export interface FloodAheadAck {
  ok: boolean;
  /** Why nothing was checked: a malformed update, one too soon after the last, a poor fix, or a database problem. */
  reason?: "invalid" | "too-fast" | "inaccurate" | "unavailable";
  /** How many floods are within the chosen distance. */
  floodsNearby?: number;
  /** Metres to the nearest of them, or null if none. */
  nearestM?: number | null;
}

/** What one connection remembers between updates. Dies with the connection; never stored. */
export interface FloodAheadState {
  /** When the last update was handled (ms since the epoch). */
  lastAt: number;
  /** For each flood already warned about, the closest distance band it was warned at. */
  warned: Map<string, number>;
}

/** The narrow read the service needs, so it can be unit-tested with an in-memory fake (section 2). */
export interface IFloodAheadRepository {
  /** Floods within `radiusM` metres of the point, nearest first. */
  findNear(lon: number, lat: number, radiusM: number): Promise<NearbyFlood[]>;
}
