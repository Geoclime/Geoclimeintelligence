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

/** What responders record on the ground: floods walked or drawn, and the drains that should carry them away. */
export type SurveyLayerId = "floodExtents" | "drainage";

/**
 * A modelled surface drawn under everything else, bundled with the app rather than fetched by area
 * (data/flood-risk). It is a judgement about where it could flood, not a record of where it did.
 */
export type HazardLayerId = "floodRisk";

/** People's own homes, private to them and staff (HouseholdLayer.tsx). */
export type PersonalLayerId = "households";

/** Every switchable layer: the boundaries, then the roads, waterways and settlements drawn over them, then field survey, then the flood risk surface. */
export type MapLayerId = BoundaryLayerId | OverlayLayerId | SurveyLayerId | HazardLayerId | PersonalLayerId;
export const BOUNDARY_LAYER_IDS: BoundaryLayerId[] = ["state", "lga", "ward"];
export const OVERLAY_LAYER_IDS: OverlayLayerId[] = ["roads", "waterways", "settlements", "infrastructure", "buildings", "wetlands"];
export const SURVEY_LAYER_IDS: SurveyLayerId[] = ["floodExtents", "drainage"];
export const HAZARD_LAYER_IDS: HazardLayerId[] = ["floodRisk"];
export const PERSONAL_LAYER_IDS: PersonalLayerId[] = ["households"];

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
  /** Which theme the colours are for. Drawn icons are named by it, so a theme change never reuses the other theme's images. */
  name: ResolvedTheme;
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
  /** Canals, drains and ditches OpenStreetMap already knows: man-made channels, so not the river blue. */
  waterChannel: string;
  waterLabel: string;
  /** Mangrove, swamp and marsh; tidal flats in a sea-green of their own. */
  wetland: string;
  wetlandTidal: string;
  settlement: string;
  settlementStroke: string;
  facility: Record<FacilityGroup, string>;
  building: string;
  buildingLine: string;
  /**
   * Field survey (survey-style.ts): a flood still going, one that has receded, a drain by its condition,
   * and a walk in progress. Floods are magenta, not blue: blue is water, and a flood beside a river must not read as the river.
   * The walk in progress is the flood's own colour, dashed, so it visibly becomes the saved flood.
   *
   * Drain colours are their own values, never a facility's or a road's: a red dot must not be readable
   * as either a hospital or a blocked drain. Every drain is also drawn with a casing in `drainCasing`
   * and spots are shapes, not dots, so the two never look alike even where colours are close.
   */
  flood: string;
  floodReceded: string;
  drain: { good: string; warn: string; bad: string };
  drainCasing: string;
  draft: string;
}

export function mapPalette(theme: ResolvedTheme): MapPalette {
  return theme === "dark"
    ? {
        name: "dark",
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
        waterChannel: "#22ccee",
        waterLabel: "#84caff",
        wetland: "#85e13a",
        wetlandTidal: "#22ccee",
        settlement: "#b692f6",
        settlementStroke: "#101828",
        facility: { health: "#f97066", education: "#fac515", civic: "#f670c7", community: "#32d583", other: "#98a2b3" },
        building: "#7a5c45",
        buildingLine: "#c4a484",
        flood: "#e879f9",
        floodReceded: "#98a2b3",
        drain: { good: "#3ccb7f", warn: "#fde272", bad: "#fd6f8e" },
        drainCasing: "#ffffff",
        draft: "#e879f9",
      }
    : {
        name: "light",
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
        waterChannel: "#0e7090",
        waterLabel: "#175cd3",
        wetland: "#4f7a28",
        wetlandTidal: "#0e7090",
        settlement: "#6941c6",
        settlementStroke: "#ffffff",
        facility: { health: "#d92d20", education: "#ca8504", civic: "#c11574", community: "#039855", other: "#667085" },
        building: "#d6bfa9",
        buildingLine: "#9c7356",
        flood: "#c026d3",
        floodReceded: "#667085",
        drain: { good: "#16b364", warn: "#eaaa08", bad: "#e31b54" },
        drainCasing: "#101828",
        draft: "#c026d3",
      };
}

/** Aerial imagery with roads and place names on top, for checking what is really on the ground. */
const SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12";

export function mapStyleUrl(theme: ResolvedTheme, satellite = false): string {
  if (satellite) return SATELLITE_STYLE;
  return theme === "dark" ? "mapbox://styles/mapbox/dark-v11" : "mapbox://styles/mapbox/light-v11";
}

/**
 * Layer ids the map listens to for clicks and hover. Roads and waterways are listed so the "click anywhere"
 * popup can say what is at the spot (utils/map-features.ts); the facility dots open the facility itself.
 */
export const INTERACTIVE_LAYERS = [
  "lga-fill",
  "ward-fill",
  "infrastructure-dots",
  "roads-major",
  "roads-secondary",
  "roads-local",
  "waterways-line",
  "waterways-channel",
  "waterways-underground",
  "waterways-fill",
];

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

/** The OSM `waterway` values that are dug, not natural. Mirrors waterwayKind in utils/map-features.ts. */
export const WATER_CHANNEL_TYPES = ["canal", "drain", "ditch"];
const isLineGeometry: ExpressionSpecification = ["==", ["geometry-type"], "LineString"];
const isWaterChannel: ExpressionSpecification = ["in", ["coalesce", ["get", "waterwayType"], ""], ["literal", WATER_CHANNEL_TYPES]];
/** OSM's `tunnel` tag: "culvert", "yes"... anything but blank or "no" means the water is out of sight. */
const isUnderground: ExpressionSpecification = ["!", ["in", ["coalesce", ["get", "tunnel"], ""], ["literal", ["", "no"]]]];

/**
 * A letter inside each facility dot from street level, so the kind can be read without the colour:
 * H health, P police and fire, G government, S schools, M markets, T transport, C community and worship, W water.
 */
export const FACILITY_LETTER: Readonly<Record<FacilityType, string>> = {
  health: "H",
  emergency: "P",
  government: "G",
  education: "S",
  market: "M",
  transport: "T",
  community: "C",
  worship: "C",
  water: "W",
  telecom: "",
};

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
  const waterWidth = [
    "interpolate", ["linear"], ["zoom"],
    8, ["match", ["get", "waterClass"], "river", 1.4, 0.6],
    14, ["match", ["get", "waterClass"], "river", 4, "creek", 2, 1.2],
  ] as unknown as number;
  // A natural channel in the open: rivers, creeks and streams.
  const waterLine: LayerProps = {
    id: "waterways-line",
    type: "line",
    filter: ["all", isLineGeometry, ["!", isWaterChannel], ["!", isUnderground]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": palette.water, "line-width": waterWidth },
  };
  // Canals, drains and ditches OpenStreetMap maps: man-made, so drawn in their own colour.
  const waterChannel: LayerProps = {
    id: "waterways-channel",
    type: "line",
    filter: ["all", isLineGeometry, isWaterChannel, ["!", isUnderground]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": palette.waterChannel, "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.8, 16, 2.5] },
  };
  // Any stretch that runs through a culvert or underground: dashed and fainter, since you can't see the water there.
  const waterUnderground: LayerProps = {
    id: "waterways-underground",
    type: "line",
    filter: ["all", isLineGeometry, isUnderground],
    paint: {
      "line-color": ["case", isWaterChannel, palette.waterChannel, palette.water],
      "line-width": waterWidth,
      "line-opacity": 0.75,
      "line-dasharray": [1.5, 1.5],
    },
  };
  const waterLabels: LayerProps = {
    id: "waterways-labels",
    type: "symbol",
    minzoom: 11,
    filter: ["all", isLineGeometry, ["!=", ["get", "name"], null]],
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 400,
      "text-field": ["get", "name"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 16, 13],
      "text-font": ["DIN Pro Italic", "Arial Unicode MS Regular"],
      "text-letter-spacing": 0.05,
    },
    paint: { "text-color": palette.waterLabel, "text-halo-color": palette.labelHalo, "text-halo-width": 1.5 },
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
  // A place an administrator saved by hand gets a dark ring and a slightly larger dot, so they can find their own.
  const savedByHand = ["==", ["get", "origin"], "manual"];
  const infrastructureDots: LayerProps = {
    id: "infrastructure-dots",
    type: "circle",
    paint: {
      "circle-color": facilityColour,
      "circle-stroke-color": ["case", savedByHand, palette.label, palette.settlementStroke] as unknown as string,
      "circle-stroke-width": ["case", savedByHand, 2, 1] as unknown as number,
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["zoom"],
        8,
        ["case", savedByHand, 4, 2.5],
        14,
        ["case", savedByHand, 8, 6],
        17,
        ["case", savedByHand, 11, 9.5],
      ] as unknown as number,
    },
  };
  const infrastructureGlyphs: LayerProps = {
    id: "infrastructure-glyphs",
    type: "symbol",
    minzoom: 15,
    layout: {
      "text-field": [
        "match",
        ["get", "facilityType"],
        ...(Object.entries(FACILITY_LETTER) as [FacilityType, string][]).flatMap(([type, letter]) => [type, letter]),
        "",
      ] as unknown as string,
      "text-size": ["interpolate", ["linear"], ["zoom"], 15, 8, 17, 11],
      "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    // The dark theme's dots are bright, the light theme's deep: the letter takes the opposite.
    paint: { "text-color": palette.name === "dark" ? "#101828" : "#ffffff" },
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

  // Wetlands under everything else: the ground the water spreads over, not water itself.
  const isTidal: ExpressionSpecification = ["==", ["get", "wetlandClass"], "tidal_flat"];
  const wetlandFill: LayerProps = {
    id: "wetlands-fill",
    type: "fill",
    paint: {
      "fill-color": ["case", isTidal, palette.wetlandTidal, palette.wetland] as unknown as string,
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.22, 14, 0.32],
    },
  };
  const wetlandLine: LayerProps = {
    id: "wetlands-line",
    type: "line",
    minzoom: 11,
    paint: { "line-color": ["case", isTidal, palette.wetlandTidal, palette.wetland] as unknown as string, "line-width": 0.6, "line-opacity": 0.7, "line-dasharray": [3, 2] },
  };

  return {
    wetlandFill,
    wetlandLine,
    waterFill,
    buildingFill,
    buildingLine,
    waterLine,
    waterChannel,
    waterUnderground,
    waterLabels,
    roadLocal,
    roadSecondary,
    roadMajor,
    roadLabels,
    settlementDots,
    settlementLabels,
    infrastructureDots,
    infrastructureGlyphs,
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
