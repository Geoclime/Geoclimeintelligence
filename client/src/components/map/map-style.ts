import type { LayerProps } from "react-map-gl/mapbox";
import type { ResolvedTheme } from "../../contexts/ThemeContext";
import { brand } from "../../styles/theme";
import type { BBox } from "../../types/admin-unit.types";

/**
 * Colours and layer definitions for the boundary map, in one place so the map, the legend and the
 * review map agree. Mapbox paint can't read CSS variables, so the values come from theme.ts.
 */

/** Wards are only fetched and drawn from this zoom: below it, 318 small shapes are clutter. */
export const WARD_MIN_ZOOM = 10;

/** Before any data arrives: the standard's own Rivers State starting view (section 10). */
export const DEFAULT_VIEW = { longitude: 7.0, latitude: 4.85, zoom: 8 };

export type BoundaryLayerId = "state" | "lga" | "ward";

export interface MapPalette {
  state: string;
  lga: string;
  lgaFill: string;
  ward: string;
  selected: string;
  label: string;
  labelHalo: string;
  passed: string;
  failed: string;
}

export function mapPalette(theme: ResolvedTheme): MapPalette {
  return theme === "dark"
    ? {
        state: "#9ee0e2",
        lga: brand.tealBright,
        lgaFill: brand.tealBright,
        ward: "#a3b8b9",
        selected: "#fdb022",
        label: "#e6f0f0",
        labelHalo: "#061819",
        passed: brand.tealBright,
        failed: "#f97066",
      }
    : {
        state: brand.tealDeep,
        lga: brand.teal,
        lgaFill: brand.teal,
        ward: "#4a5e60",
        selected: "#b54708",
        label: brand.tealDeep,
        labelHalo: "#ffffff",
        passed: brand.teal,
        failed: "#b42318",
      };
}

export function mapStyleUrl(theme: ResolvedTheme): string {
  return theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11";
}

/** Layer ids the map listens to for clicks and hover. */
export const INTERACTIVE_LAYERS = ["lga-fill", "ward-fill"];

export function boundaryLayers(palette: MapPalette, selectedLgaId: string | null) {
  const state: LayerProps = {
    id: "state-line",
    type: "line",
    paint: { "line-color": palette.state, "line-width": 2.5 },
  };
  const lgaFill: LayerProps = {
    id: "lga-fill",
    type: "fill",
    paint: {
      "fill-color": palette.lgaFill,
      "fill-opacity": ["case", ["==", ["get", "id"], selectedLgaId ?? ""], 0.18, 0.05],
    },
  };
  const lgaLine: LayerProps = {
    id: "lga-line",
    type: "line",
    paint: { "line-color": palette.lga, "line-width": 1.2 },
  };
  const lgaSelected: LayerProps = {
    id: "lga-selected",
    type: "line",
    filter: ["==", ["get", "id"], selectedLgaId ?? ""],
    paint: { "line-color": palette.selected, "line-width": 3 },
  };
  const wardFill: LayerProps = {
    id: "ward-fill",
    type: "fill",
    minzoom: WARD_MIN_ZOOM,
    paint: { "fill-color": palette.ward, "fill-opacity": 0.01 },
  };
  const wardLine: LayerProps = {
    id: "ward-line",
    type: "line",
    minzoom: WARD_MIN_ZOOM,
    paint: { "line-color": palette.ward, "line-width": 0.8, "line-dasharray": [2, 2] },
  };
  const lgaLabels: LayerProps = {
    id: "lga-labels",
    type: "symbol",
    layout: {
      "text-field": ["get", "unitName"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 7, 10, 11, 14],
      "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
      "text-allow-overlap": false,
    },
    paint: { "text-color": palette.label, "text-halo-color": palette.labelHalo, "text-halo-width": 1.5 },
  };
  return { state, lgaFill, lgaLine, lgaSelected, wardFill, wardLine, lgaLabels };
}

/** Import review map: passed shapes in teal, failed shapes in red. */
export function stagingLayers(palette: MapPalette) {
  const color = ["match", ["get", "status"], "failed", palette.failed, palette.passed] as unknown as string;
  const fill: LayerProps = { id: "staging-fill", type: "fill", paint: { "fill-color": color, "fill-opacity": 0.15 } };
  const line: LayerProps = {
    id: "staging-line",
    type: "line",
    paint: {
      "line-color": color,
      "line-width": ["match", ["get", "status"], "failed", 2.5, 1] as unknown as number,
    },
  };
  return { fill, line };
}

/** Expands a bbox by a fraction of its size, so a fitted shape isn't drawn against the edge. */
export function padBBox([minLon, minLat, maxLon, maxLat]: BBox, fraction = 0.05): BBox {
  const dx = (maxLon - minLon) * fraction;
  const dy = (maxLat - minLat) * fraction;
  return [minLon - dx, minLat - dy, maxLon + dx, maxLat + dy];
}
