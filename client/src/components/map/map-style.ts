import type { ExpressionSpecification } from "mapbox-gl";
import type { LayerProps } from "react-map-gl/mapbox";
import type { ResolvedTheme } from "../../contexts/ThemeContext";
import { brand } from "../../styles/theme";
import type { BBox } from "../../types/admin-unit.types";
import type { FacilityType, OverlayLayerId } from "../../types/map-layer.types";

/**
 * Colours and layer definitions for the boundary map, in one place so the map, the legend and the
 * review map agree. Mapbox paint can't read CSS variables, so the values come from theme.ts.
 */

/** Wards are only fetched and drawn from this zoom: below it, 318 small shapes are clutter. */
export const WARD_MIN_ZOOM = 10;

/** Before any data arrives: the standard's own Rivers State starting view (section 10). */
export const DEFAULT_VIEW = { longitude: 7.0, latitude: 4.85, zoom: 8 };

export type BoundaryLayerId = "state" | "lga" | "ward";

/** Every switchable layer: the boundaries, then the roads, waterways and settlements drawn over them. */
export type MapLayerId = BoundaryLayerId | OverlayLayerId;
export const BOUNDARY_LAYER_IDS: BoundaryLayerId[] = ["state", "lga", "ward"];
export const OVERLAY_LAYER_IDS: OverlayLayerId[] = ["roads", "waterways", "settlements", "infrastructure", "buildings"];

/** Buildings are only fetched and drawn from street level. Mirrors BUILDING_MIN_ZOOM in server/src/modules/map-layers/layer-rules.ts. */
export const BUILDING_MIN_ZOOM = 15;

/**
 * The ten facility types are drawn in five colour groups, so the legend stays short: health,
 * schools, police and government, places that can shelter people, and everything else.
 */
export const FACILITY_GROUPS = ["health", "education", "civic", "community", "other"] as const;
export type FacilityGroup = (typeof FACILITY_GROUPS)[number];

export const FACILITY_GROUP_OF: Readonly<Record<FacilityType, FacilityGroup>> = {
  health: "health",
  education: "education",
  emergency: "civic",
  government: "civic",
  community: "community",
  worship: "community",
  market: "other",
  transport: "other",
  water: "other",
  telecom: "other",
};

export interface MapPalette {
  state: string;
  lga: string;
  lgaFill: string;
  ward: string;
  selected: string;
  /** The viewer's own position: the blue every map app uses for "you are here". */
  you: string;
  label: string;
  labelHalo: string;
  passed: string;
  failed: string;
  roadMajor: string;
  roadSecondary: string;
  roadLocal: string;
  water: string;
  waterFill: string;
  waterFillOpacity: number;
  settlement: string;
  settlementStroke: string;
  facility: Record<FacilityGroup, string>;
  building: string;
  buildingLine: string;
}

export function mapPalette(theme: ResolvedTheme): MapPalette {
  return theme === "dark"
    ? {
        state: "#9ee0e2",
        lga: brand.tealBright,
        lgaFill: brand.tealBright,
        ward: "#a3b8b9",
        selected: "#fdb022",
        you: "#3b9cff",
        label: "#e6f0f0",
        labelHalo: "#061819",
        passed: brand.tealBright,
        failed: "#f97066",
        roadMajor: "#ff9c66",
        roadSecondary: "#fec84b",
        roadLocal: "#98a2b3",
        water: "#53b1fd",
        waterFill: "#2e90fa",
        waterFillOpacity: 0.35,
        settlement: "#b692f6",
        settlementStroke: "#101828",
        facility: { health: "#f97066", education: "#fac515", civic: "#f670c7", community: "#32d583", other: "#98a2b3" },
        building: "#7a5c45",
        buildingLine: "#c4a484",
      }
    : {
        state: brand.tealDeep,
        lga: brand.teal,
        lgaFill: brand.teal,
        ward: "#4a5e60",
        selected: "#b54708",
        you: "#1570ef",
        label: brand.tealDeep,
        labelHalo: "#ffffff",
        passed: brand.teal,
        failed: "#b42318",
        roadMajor: "#b93815",
        roadSecondary: "#dc6803",
        roadLocal: "#667085",
        water: "#1570ef",
        waterFill: "#84caff",
        waterFillOpacity: 0.55,
        settlement: "#6941c6",
        settlementStroke: "#ffffff",
        facility: { health: "#d92d20", education: "#ca8504", civic: "#c11574", community: "#039855", other: "#667085" },
        building: "#d6bfa9",
        buildingLine: "#9c7356",
      };
}

/** Aerial imagery with roads and place names on top, for checking what is really on the ground. */
const SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

export function mapStyleUrl(theme: ResolvedTheme, satellite = false): string {
  if (satellite) return SATELLITE_STYLE;
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

const MAJOR_ROADS = ["motorway", "motorway_link", "trunk", "trunk_link", "primary", "primary_link"];
const SECONDARY_ROADS = ["secondary", "secondary_link", "tertiary", "tertiary_link"];

const isRoadOf = (classes: string[]): ExpressionSpecification => ["in", ["get", "roadClass"], ["literal", classes]];

/**
 * Roads, waterways and settlements, drawn under the boundary lines. The server thins each layer
 * by zoom (layer-rules.ts), so these paint rules only decide how what arrives looks: main roads
 * heavier and warmer, creeks thinner than rivers, primary settlements larger and labelled first.
 */
export function overlayLayers(palette: MapPalette) {
  const waterFill: LayerProps = {
    id: "waterways-fill",
    type: "fill",
    filter: ["==", ["geometry-type"], "Polygon"],
    paint: { "fill-color": palette.waterFill, "fill-opacity": palette.waterFillOpacity, "fill-outline-color": palette.water },
  };
  const waterLine: LayerProps = {
    id: "waterways-line",
    type: "line",
    filter: ["==", ["geometry-type"], "LineString"],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": palette.water,
      "line-width": [
        "interpolate", ["linear"], ["zoom"],
        8, ["match", ["get", "waterClass"], "river", 1.4, 0.6],
        14, ["match", ["get", "waterClass"], "river", 4, "creek", 2, 1.2],
      ],
    },
  };

  const roadWidth = (min: number, max: number) => ["interpolate", ["linear"], ["zoom"], 8, min, 14, max] as unknown as number;
  const roadLocal: LayerProps = {
    id: "roads-local",
    type: "line",
    filter: ["!", ["any", isRoadOf(MAJOR_ROADS), isRoadOf(SECONDARY_ROADS)]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": palette.roadLocal, "line-width": roadWidth(0.4, 2) },
  };
  const roadSecondary: LayerProps = {
    id: "roads-secondary",
    type: "line",
    filter: isRoadOf(SECONDARY_ROADS),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": palette.roadSecondary, "line-width": roadWidth(0.8, 3) },
  };
  const roadMajor: LayerProps = {
    id: "roads-major",
    type: "line",
    filter: isRoadOf(MAJOR_ROADS),
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": palette.roadMajor, "line-width": roadWidth(1.2, 4.5) },
  };
  const roadLabels: LayerProps = {
    id: "roads-labels",
    type: "symbol",
    minzoom: 13,
    filter: ["!=", ["get", "name"], null],
    layout: {
      "symbol-placement": "line",
      "text-field": ["get", "name"],
      "text-size": 11,
      "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
    },
    paint: { "text-color": palette.label, "text-halo-color": palette.labelHalo, "text-halo-width": 1.5 },
  };

  const primary: ExpressionSpecification = ["get", "isPrimary"];
  const settlementDots: LayerProps = {
    id: "settlements-dots",
    type: "circle",
    paint: {
      "circle-color": palette.settlement,
      "circle-stroke-color": palette.settlementStroke,
      "circle-stroke-width": 1,
      "circle-radius": [
        "interpolate", ["linear"], ["zoom"],
        8, ["case", primary, 3, 2],
        13, ["case", primary, 6.5, 4.5],
      ],
    },
  };
  const settlementLabels: LayerProps = {
    id: "settlements-labels",
    type: "symbol",
    minzoom: 10,
    layout: {
      "text-field": ["get", "name"],
      "text-size": 11,
      "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
      "text-anchor": "top",
      "text-offset": [0, 0.7],
      "text-optional": true,
      // Lower sorts first and wins a collision, so a ward's primary settlement keeps its name.
      "symbol-sort-key": ["case", primary, 0, 1],
    },
    paint: { "text-color": palette.label, "text-halo-color": palette.labelHalo, "text-halo-width": 1.5 },
  };

  // Colour by group; the server already thins the layer by zoom (health and police first).
  const facilityColour = [
    "match",
    ["get", "facilityType"],
    ...(Object.entries(FACILITY_GROUP_OF) as [FacilityType, FacilityGroup][]).flatMap(([type, group]) => [type, palette.facility[group]]),
    palette.facility.other,
  ] as unknown as string;
  const infrastructureDots: LayerProps = {
    id: "infrastructure-dots",
    type: "circle",
    paint: {
      "circle-color": facilityColour,
      "circle-stroke-color": palette.settlementStroke,
      "circle-stroke-width": 1,
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 2.5, 14, 6],
    },
  };
  const infrastructureLabels: LayerProps = {
    id: "infrastructure-labels",
    type: "symbol",
    minzoom: 13,
    filter: ["!=", ["get", "name"], null],
    layout: {
      "text-field": ["get", "name"],
      "text-size": 10,
      "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
      "text-anchor": "top",
      "text-offset": [0, 0.6],
      "text-optional": true,
    },
    paint: { "text-color": palette.label, "text-halo-color": palette.labelHalo, "text-halo-width": 1.5 },
  };

  const buildingFill: LayerProps = {
    id: "buildings-fill",
    type: "fill",
    minzoom: BUILDING_MIN_ZOOM,
    paint: { "fill-color": palette.building, "fill-opacity": 0.75 },
  };
  const buildingLine: LayerProps = {
    id: "buildings-line",
    type: "line",
    minzoom: BUILDING_MIN_ZOOM,
    paint: { "line-color": palette.buildingLine, "line-width": 0.6 },
  };

  return {
    waterFill,
    buildingFill,
    buildingLine,
    waterLine,
    roadLocal,
    roadSecondary,
    roadMajor,
    roadLabels,
    settlementDots,
    settlementLabels,
    infrastructureDots,
    infrastructureLabels,
  };
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
