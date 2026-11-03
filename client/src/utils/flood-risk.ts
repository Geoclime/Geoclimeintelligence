import type { FloodRiskClass, FloodRiskLayer, ImageCorners } from "../types/flood-risk.types";

/** How much of the map underneath shows through: enough to keep roads, rivers and place names readable. */
export const FLOOD_RISK_OPACITY = 0.8;

/**
 * What the map layer holds while the real picture is still on its way (a 1 x 1 transparent GIF, hidden
 * anyway). The layer is added to the map at once, so it keeps its place under the roads and rivers that
 * are added after it; the real picture is swapped in when it arrives.
 */
export const EMPTY_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
export const PARKED_CORNERS: ImageCorners = [[0, 1], [1, 1], [1, 0], [0, 0]];

/** Legend rows, lowest risk first as on the data team's map. A row's `color` is painted as its swatch. */
export function floodRiskLegend(classes: FloodRiskClass[]) {
  return classes.map((risk) => ({
    key: `flood-risk-${risk.value}`,
    label: `Flood risk: ${risk.label}`,
    swatch: "flood-risk",
    color: risk.color,
  }));
}

/**
 * What the layer is, in one line under the legend: who made the data and under what licence (from
 * the data source the administrator chose at import), and that it is derived and relative, so it is
 * never read as a forecast.
 */
export function floodRiskNote(layer: FloodRiskLayer): string {
  const { provider, datasetName, license } = layer.source;
  return `Flood risk: ${provider}, ${datasetName} (${license}). A derived index mapped at ${layer.cellSizeMetres} m. It shows relative risk, not a forecast or flood depth.`;
}

/** A class's share of the map's classified area, 0 to 100, to one decimal. */
export function classShare(risk: FloodRiskClass, total: number): number {
  return total > 0 ? Math.round((risk.areaKm2 / total) * 1000) / 10 : 0;
}
