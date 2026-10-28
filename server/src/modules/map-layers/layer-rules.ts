/**
 * How much of each map layer the API sends at a given zoom. Rivers State has 47,507 road
 * segments; sending them all for a whole-state view would be megabytes nobody can read, so a
 * low zoom gets only the roads and rivers that matter at that scale, and every layer also has a
 * hard cap as a second line of defence (backend standard section 10).
 *
 * Pure functions and constants, no database: the repositories turn these numbers into SQL, and
 * the loader uses roadClassRank to fill roads.class_rank when it stores a road.
 */

export const MAP_LAYER_IDS = ["roads", "waterways", "settlements", "infrastructure"] as const;
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

/**
 * The kinds of facility the infrastructure layer keeps (the ERD's `facility_type`), most
 * important first: that order is the order a capped reply keeps them in. Every other
 * OpenStreetMap class (shops, kiosks, sports pitches, hotels...) is left out by the loader.
 */
export const FACILITY_TYPES = [
  "health",
  "emergency",
  "education",
  "government",
  "market",
  "transport",
  "community",
  "worship",
  "water",
  "telecom",
] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

/** Geofabrik's `fclass` values that make up each facility type. */
const FACILITY_CLASSES: Readonly<Record<string, FacilityType>> = {
  hospital: "health",
  clinic: "health",
  doctors: "health",
  dentist: "health",
  pharmacy: "health",
  chemist: "health",
  nursing_home: "health",
  police: "emergency",
  fire_station: "emergency",
  school: "education",
  college: "education",
  university: "education",
  kindergarten: "education",
  town_hall: "government",
  courthouse: "government",
  post_office: "government",
  marketplace: "market",
  mall: "market",
  ferry_terminal: "transport",
  bus_station: "transport",
  railway_station: "transport",
  airport: "transport",
  airfield: "transport",
  helipad: "transport",
  community_centre: "community",
  library: "community",
  water_well: "water",
  drinking_water: "water",
  water_tower: "water",
  water_works: "water",
  wastewater_plant: "water",
  comms_tower: "telecom",
};

/** Places of worship come from Geofabrik's pofw layer, named by religion: christian, christian_anglican, muslim... */
const WORSHIP_CLASS = /^(christian|muslim|jewish|hindu|buddhist|sikh|taoist|shintoist)(_|$)/;

/** The facility type of a Geofabrik `fclass`, or null for a class the layer doesn't keep. */
export function facilityTypeOf(osmClass: string): FacilityType | null {
  const normalised = osmClass.trim().toLowerCase();
  return FACILITY_CLASSES[normalised] ?? (WORSHIP_CLASS.test(normalised) ? "worship" : null);
}

/** Health and emergency from the start, then services people travel to, then everything up close. */
export function facilityTypesAtZoom(zoom?: number): FacilityType[] {
  if (zoom === undefined || zoom >= 12) return [...FACILITY_TYPES];
  const nearby: FacilityType[] = ["health", "emergency"];
  return zoom >= 10 ? [...nearby, "education", "government", "market", "transport"] : nearby;
}

/** The most features one map-layer response may hold. Past it, `truncated` is true. */
export const LAYER_FEATURE_LIMIT: Readonly<Record<MapLayerId, number>> = {
  roads: 12_000,
  waterways: 6_000,
  settlements: 5_000,
  infrastructure: 5_000,
};

/**
 * About one screen pixel in degrees at this zoom (512 px Mapbox tiles), the same rule the
 * admin-unit layers use. 0 means "no simplification".
 */
export function simplifyTolerance(zoom?: number): number {
  return zoom === undefined ? 0 : 180 / (512 * 2 ** zoom);
}
