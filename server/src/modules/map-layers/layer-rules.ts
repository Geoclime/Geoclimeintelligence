/**
 * How much of each map layer the API sends at a given zoom. Rivers State has 47,507 road
 * segments; sending them all for a whole-state view would be megabytes nobody can read, so a
 * low zoom gets only the roads and rivers that matter at that scale, and every layer also has a
 * hard cap as a second line of defence (backend standard section 10).
 *
 * Pure functions and constants, no database: the repositories turn these numbers into SQL, and
 * the loader uses roadClassRank to fill roads.class_rank when it stores a road.
 */

export const MAP_LAYER_IDS = ["roads", "waterways", "settlements"] as const;
export type MapLayerId = (typeof MAP_LAYER_IDS)[number];

/** Lower = more important. Anything not listed (track, path, footway, construction...) is minor. */
const ROAD_CLASS_RANK: Readonly<Record<string, number>> = {
  motorway: 1,
  motorway_link: 1,
  trunk: 1,
  trunk_link: 1,
  primary: 2,
  primary_link: 2,
  secondary: 3,
  secondary_link: 3,
  tertiary: 4,
  tertiary_link: 4,
  unclassified: 5,
  residential: 6,
  living_street: 6,
  service: 7,
};

export const MINOR_ROAD_RANK = 8;

/** The importance rank stored in roads.class_rank, so the zoom filter is a plain indexed comparison. */
export function roadClassRank(roadClass: string): number {
  return ROAD_CLASS_RANK[roadClass.trim().toLowerCase()] ?? MINOR_ROAD_RANK;
}

/** [lowest zoom at which the rank appears, the rank], most detailed first. */
const ROAD_ZOOM_STEPS: readonly (readonly [number, number])[] = [
  [14, 8],
  [13, 7],
  [12, 6],
  [11, 5],
  [10, 4],
  [9, 3],
];

/** The least important road rank worth drawing at this zoom. No zoom given = everything. */
export function maxRoadRank(zoom?: number): number {
  if (zoom === undefined) return MINOR_ROAD_RANK;
  return ROAD_ZOOM_STEPS.find(([minZoom]) => zoom >= minZoom)?.[1] ?? 2;
}

export const WATER_CLASSES = ["river", "creek", "other"] as const;
export type WaterClass = (typeof WATER_CLASSES)[number];

export function isWaterClass(value: string): value is WaterClass {
  return (WATER_CLASSES as readonly string[]).includes(value);
}

/** Rivers from the start, creeks once you are closer, everything else (ditches, ponds) up close. */
export function waterClassesAtZoom(zoom?: number): WaterClass[] {
  if (zoom === undefined || zoom >= 11) return [...WATER_CLASSES];
  return zoom >= 9 ? ["river", "creek"] : ["river"];
}

/** The most features one map-layer response may hold. Past it, `truncated` is true. */
export const LAYER_FEATURE_LIMIT: Readonly<Record<MapLayerId, number>> = {
  roads: 12_000,
  waterways: 6_000,
  settlements: 5_000,
};

/**
 * About one screen pixel in degrees at this zoom (512 px Mapbox tiles), the same rule the
 * admin-unit layers use. 0 means "no simplification".
 */
export function simplifyTolerance(zoom?: number): number {
  return zoom === undefined ? 0 : 180 / (512 * 2 ** zoom);
}
