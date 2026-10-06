import type { LonLat } from "../types/admin-unit.types";

/**
 * "4.7774° N, 7.0134° E". Takes GeoJSON order [lon, lat] (easy to invert by mistake) and prints
 * latitude first, the way people read coordinates. Four decimals is about 11 m.
 */
export function formatCoordinates([lon, lat]: LonLat): string {
  const latText = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? "N" : "S"}`;
  const lonText = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? "E" : "W"}`;
  return `${latText}, ${lonText}`;
}
