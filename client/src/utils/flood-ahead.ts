import type { FloodAheadWarning } from "../types/flood-ahead.types";
import { MAP_PATH, writePin } from "./map-url";

/** A link that opens the map on the flood, with a pin, the way flood reports link to theirs. */
export function floodMapHref(warning: FloodAheadWarning): string {
  const [lng, lat] = warning.point;
  const params = writePin(new URLSearchParams({ lng: lng.toFixed(5), lat: lat.toFixed(5), z: "15" }), warning.point, "Flood");
  return `${MAP_PATH}?${params.toString()}`;
}

/** "800 m", "1.2 km", "3 km": rounded the way a driver reads it. */
export function formatDistance(metres: number): string {
  if (metres < 1_000) return `${Math.max(10, Math.round(metres / 10) * 10)} m`;
  const km = Math.round(metres / 100) / 10;
  return `${Number.isInteger(km) ? km : km.toFixed(1)} km`;
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;

/** "north-east": which way the flood lies from the person, in eight points of the compass. */
export function compassWord(bearingDeg: number): string {
  return COMPASS[Math.round((((bearingDeg % 360) + 360) % 360) / 45) % 8]!;
}

/** The water depth as a reader says it: "knee-deep", "impassable". */
function depthWord(depth: string): string {
  return depth === "impassable" ? "impassable" : `${depth}-deep`;
}

/**
 * The one line a warning is announced with: "Flood 1.2 km away, to the north-east, in Obio/Akpor (knee-deep)."
 * "Away", not "ahead": the server knows how close the flood is and which way it lies, not which way the person is facing.
 */
export function describeWarning(warning: FloodAheadWarning): string {
  if (warning.distanceM <= 50) {
    return `You are at a flooded place${warning.place ? ` in ${warning.place}` : ""}${warning.depth ? ` (${depthWord(warning.depth)})` : ""}.`;
  }
  const what = warning.kind === "report" ? "Flooding reported" : "Flood";
  const where = warning.bearingDeg === null ? "" : `, to the ${compassWord(warning.bearingDeg)}`;
  const place = warning.place ? `, in ${warning.place}` : "";
  const depth = warning.depth ? ` (${depthWord(warning.depth)})` : "";
  return `${what} ${formatDistance(warning.distanceM)} away${where}${place}${depth}.`;
}
