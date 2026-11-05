import type { BBox, LonLat } from "../types/admin-unit.types";

/** How far apart two places are, and which way: what "trace me to that spot" needs. */

const EARTH_RADIUS_M = 6_371_000;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Straight-line (great-circle) distance in metres. */
export function distanceMetres([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** The compass direction from one place to another in degrees: 0 is north, 90 east. */
export function bearingDegrees([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const dLon = radians(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(radians(lat2));
  const x = Math.cos(radians(lat1)) * Math.sin(radians(lat2)) - Math.sin(radians(lat1)) * Math.cos(radians(lat2)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"] as const;

export function compassPoint(degrees: number): string {
  return COMPASS[Math.round(degrees / 45) % 8]!;
}

/** "45 m", "850 m", "1.2 km", "14 km": no false precision. */
export function formatDistance(metres: number): string {
  if (metres < 100) return `${Math.max(5, Math.round(metres / 5) * 5)} m`;
  if (metres < 1000) return `${Math.round(metres / 10) * 10} m`;
  if (metres < 10_000) return `${(metres / 1000).toFixed(1)} km`;
  return `${Math.round(metres / 1000)} km`;
}

/** Where `to` is from where `from` stands: "1.2 km north-east of you", or that you are at it. */
export function describeOffset(from: LonLat, to: LonLat): string {
  const metres = distanceMetres(from, to);
  if (metres < 25) return "You are at this spot";
  return `${formatDistance(metres)} ${compassPoint(bearingDegrees(from, to))} of you`;
}

/** A box around some places, never smaller than `minSpan` degrees (about 450 m) so two close points don't zoom to the rooftops. */
export function boundsAround(points: LonLat[], minSpan = 0.004): BBox {
  const lons = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  const [west, east] = [Math.min(...lons), Math.max(...lons)];
  const [south, north] = [Math.min(...lats), Math.max(...lats)];
  const padLon = Math.max(0, (minSpan - (east - west)) / 2);
  const padLat = Math.max(0, (minSpan - (north - south)) / 2);
  return [west - padLon, south - padLat, east + padLon, north + padLat];
}
