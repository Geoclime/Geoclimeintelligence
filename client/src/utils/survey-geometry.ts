import type { LonLat } from "../types/admin-unit.types";
import { distanceMetres } from "./geo-distance";

/**
 * What the recorder shows while someone walks: how far, how much ground, and which GPS fixes to
 * keep. These are estimates for the screen. The saved area and perimeter are measured again in
 * PostGIS on the spheroid, and that is the number everyone else sees.
 */

const EARTH_RADIUS_M = 6_371_000;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** The length of a path in metres; with `closed`, the last point is joined back to the first (a perimeter). */
export function pathLengthMetres(points: readonly LonLat[], closed = false): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distanceMetres(points[i - 1]!, points[i]!);
  if (closed && points.length > 2) total += distanceMetres(points[points.length - 1]!, points[0]!);
  return total;
}

/**
 * The ground inside a ring of points, in square metres. The points are laid flat around their own
 * middle (a flood is metres to a few kilometres across, where that is accurate to well under a
 * percent) and the area is taken with the shoelace rule. A ring that crosses itself gives the
 * difference of its loops, not their sum, so this is a guide, never a stored figure.
 */
export function polygonAreaMetres(points: readonly LonLat[]): number {
  if (points.length < 3) return 0;
  const middleLat = points.reduce((sum, [, lat]) => sum + lat, 0) / points.length;
  const middleLon = points.reduce((sum, [lon]) => sum + lon, 0) / points.length;
  const east = EARTH_RADIUS_M * Math.cos(radians(middleLat));
  const flat = points.map(([lon, lat]) => [radians(lon - middleLon) * east, radians(lat - middleLat) * EARTH_RADIUS_M] as const);

  let twice = 0;
  for (let i = 0; i < flat.length; i++) {
    const [x1, y1] = flat[i]!;
    const [x2, y2] = flat[(i + 1) % flat.length]!;
    twice += x1 * y2 - x2 * y1;
  }
  return Math.abs(twice) / 2;
}

/** "850 m²", "1.2 ha", "3.4 km²": the unit people use for the size of the thing. */
export function formatArea(squareMetres: number): string {
  if (squareMetres < 10_000) return `${Math.round(squareMetres).toLocaleString("en")} m²`;
  if (squareMetres < 1_000_000) return `${(squareMetres / 10_000).toFixed(1)} ha`;
  return `${(squareMetres / 1_000_000).toFixed(1)} km²`;
}

/** The fixes below this are too vague to trace an edge with: a phone indoors, or just switched on. */
export const MAX_FIX_ACCURACY_M = 30;
/** The least distance between two recorded points, however good the fix. */
export const MIN_STEP_M = 6;
/** More points than this are thinned before saving (the server takes 2,000). */
export const MAX_RECORDED_POINTS = 1_500;

export interface Fix {
  point: LonLat;
  /** The device's own estimate of how far off it may be, in metres. */
  accuracy: number;
}

export type FixVerdict = "added" | "too-vague" | "too-close";

/**
 * Whether a new GPS fix should become a point on the path. A vague fix is dropped (its accuracy
 * circle is wider than the shape), and so is one that has not moved further than the device's own
 * jitter: standing still would otherwise draw a scribble. A walk's first good fix always counts.
 */
export function judgeFix(points: readonly LonLat[], fix: Fix): FixVerdict {
  if (fix.accuracy > MAX_FIX_ACCURACY_M) return "too-vague";
  const last = points[points.length - 1];
  if (!last) return "added";
  return distanceMetres(last, fix.point) >= Math.max(MIN_STEP_M, fix.accuracy / 2) ? "added" : "too-close";
}

/** Keeps at most `max` points, evenly spaced along the path, always including the first and the last. */
export function thinPoints(points: readonly LonLat[], max = MAX_RECORDED_POINTS): LonLat[] {
  if (points.length <= max || max < 2) return [...points];
  const kept: LonLat[] = [];
  for (let i = 0; i < max; i++) kept.push(points[Math.round((i * (points.length - 1)) / (max - 1))]!);
  return kept;
}

/** The middle value, so one wild fix doesn't speak for the walk. Undefined for none. */
export function medianOf(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export type GpsQuality = "good" | "fair" | "poor";

/** How much to trust a fix, for the recorder's signal light: good under 10 m, fair under 30 m. */
export function gpsQuality(accuracyM: number): GpsQuality {
  if (accuracyM <= 10) return "good";
  return accuracyM <= MAX_FIX_ACCURACY_M ? "fair" : "poor";
}
