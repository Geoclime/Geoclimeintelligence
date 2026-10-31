import type { LonLat } from "../types/admin-unit.types";

/**
 * A link that shows this spot in Google Maps. Takes GeoJSON order [lon, lat] and writes latitude
 * first, which is the order Google expects.
 */
export function googleMapsUrl([lon, lat]: LonLat): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
}
