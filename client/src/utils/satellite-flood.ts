import type { SatelliteFloodLayer } from "../types/satellite-flood.types";
import { formatYearMonth } from "./rainfall-summary";

/** km² for display: whole numbers with separators, one decimal under 10. */
export function formatKm2(km2: number): string {
  return km2.toLocaleString("en", { maximumFractionDigits: km2 < 10 ? 1 : 0 });
}

/** The legend row for the month shown, painted in the picture's own colour. */
export function satelliteFloodLegend(layer: SatelliteFloodLayer) {
  return [{ key: "satellite-flood", label: `Water seen by satellite, ${formatYearMonth(layer.yearMonth)}`, swatch: "satellite-flood", color: layer.colour }];
}

/**
 * What the layer is, in one line under the legend: who made it, and what "water" means here, so it
 * is never read as only the flood (it includes rivers and creeks) or as more precise than it is.
 */
export function satelliteFloodNote(layer: SatelliteFloodLayer): string {
  const { provider, datasetName, license } = layer.source;
  return (
    `Satellite water: ${provider}, ${datasetName} (${license}). Open water Sentinel-1 radar saw in ${formatYearMonth(layer.yearMonth)}, ` +
    `about ${Math.round(layer.pixelMetres)} m a pixel. It includes rivers and creeks, and can mistake smooth dry ground for water.`
  );
}
