import type { ExpressionSpecification } from "mapbox-gl";
import type { LayerProps } from "react-map-gl/mapbox";
import type { MapPalette } from "./map-style";

/**
 * Layers for field survey: the floods and drains responders recorded, and the walk in progress. Ids
 * are exported because the map listens to some of them for clicks (see SURVEY_INTERACTIVE_LAYERS).
 */

/** A group of drainage spots drawn as one circle when zoomed out; a tap zooms in (SurveyLayers.tsx). */
export const DRAIN_CLUSTER_LAYER = "drainage-clusters";

/** The shapes a click can open: a flood, a drain's line (through a wide invisible strip, so a thin drain can be tapped), a drain's spot, a cluster of spots. */
export const SURVEY_INTERACTIVE_LAYERS = ["flood-extent-fill", "drainage-hit", "drainage-points", DRAIN_CLUSTER_LAYER];

const isPolygon: ExpressionSpecification = ["==", ["geometry-type"], "Polygon"];
const isLine: ExpressionSpecification = ["==", ["geometry-type"], "LineString"];
const isPoint: ExpressionSpecification = ["==", ["geometry-type"], "Point"];

/** Green when clear, amber when partly blocked, red when water is not getting through. Drains are drawn from utils/drain-display.ts, which sets `tone`. */
function conditionColour(palette: MapPalette): ExpressionSpecification {
  return ["match", ["get", "tone"], "good", palette.drain.good, "warn", palette.drain.warn, palette.drain.bad];
}

const needsAttention: ExpressionSpecification = ["==", ["get", "tone"], "bad"];
const isCovered: ExpressionSpecification = ["==", ["get", "kind"], "covered_drain"];
/** Faded when nobody has checked it for DRAIN_STALE_DAYS: the colour is then only what it was. */
const freshness: ExpressionSpecification = ["case", ["get", "stale"], 0.45, 1];

/** A drain's line width, wider where water isn't getting through, so the worst stand out without relying on colour. */
const drainWidth = (extra: number) =>
  ["interpolate", ["linear"], ["zoom"], 10, ["case", needsAttention, 3 + extra, 2 + extra], 16, ["case", needsAttention, 7.5 + extra, 5 + extra]] as unknown as number;

/** Saved floods, then drains over them. A flood that has receded is grey and dashed: a record, not a danger. */
export function surveyLayers(palette: MapPalette) {
  const receded: ExpressionSpecification = ["get", "receded"];
  const floodFill: LayerProps = {
    id: "flood-extent-fill",
    type: "fill",
    paint: {
      "fill-color": ["case", receded, palette.floodReceded, palette.flood],
      "fill-opacity": ["case", receded, 0.14, 0.38],
    },
  };
  const floodLine: LayerProps = {
    id: "flood-extent-line",
    type: "line",
    filter: ["!", receded],
    paint: { "line-color": palette.flood, "line-width": 2.2 },
  };
  const floodRecededLine: LayerProps = {
    id: "flood-extent-receded-line",
    type: "line",
    filter: receded,
    paint: { "line-color": palette.floodReceded, "line-width": 1.6, "line-dasharray": [2, 2] },
  };
  const drainHit: LayerProps = {
    id: "drainage-hit",
    type: "line",
    filter: isLine,
    layout: { "line-cap": "round" },
    paint: { "line-color": "#000000", "line-opacity": 0, "line-width": 18 },
  };
  // Every drain sits on a casing, which roads never have: a drain is never read as a road of the same colour.
  const drainCasing: LayerProps = {
    id: "drainage-casing",
    type: "line",
    filter: isLine,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": palette.drainCasing, "line-width": drainWidth(2.5), "line-opacity": freshness },
  };
  const drainLine: LayerProps = {
    id: "drainage-line",
    type: "line",
    filter: ["all", isLine, ["!", isCovered]],
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": conditionColour(palette), "line-width": drainWidth(0), "line-opacity": freshness },
  };
  // A covered drain runs under a slab: dashed, as underground water is on the waterway layer.
  const drainCovered: LayerProps = {
    id: "drainage-line-covered",
    type: "line",
    filter: ["all", isLine, isCovered],
    layout: { "line-join": "round" },
    paint: { "line-color": conditionColour(palette), "line-width": drainWidth(0), "line-opacity": freshness, "line-dasharray": [1.2, 0.8] },
  };
  // Which way the water goes, where someone recorded it: chevrons along the line, pointing downstream.
  const drainArrows: LayerProps = {
    id: "drainage-arrows",
    type: "symbol",
    minzoom: 14,
    filter: ["all", isLine, ["get", "flowKnown"]],
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 60,
      "icon-image": `drain-arrow-${palette.name}`,
      "icon-size": ["interpolate", ["linear"], ["zoom"], 14, 0.6, 18, 1],
      "icon-allow-overlap": true,
      "icon-rotation-alignment": "map",
    },
    paint: { "icon-opacity": freshness },
  };
  // Spots are shapes (drain-icons.ts): a pipe, a triangle, a grate or a pond, never a facility's round dot.
  const drainPoints: LayerProps = {
    id: "drainage-points",
    type: "symbol",
    filter: ["all", isPoint, ["!", ["has", "point_count"]]],
    layout: {
      "icon-image": ["concat", `drain-${palette.name}-`, ["get", "kind"], "-", ["get", "tone"]],
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, ["case", needsAttention, 0.7, 0.55], 16, ["case", needsAttention, 1.25, 1]],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
      "symbol-sort-key": ["case", needsAttention, 0, 1],
    },
    paint: { "icon-opacity": freshness },
  };
  return { floodFill, floodLine, floodRecededLine, drainHit, drainCasing, drainLine, drainCovered, drainArrows, drainPoints };
}

/**
 * Drainage spots grouped when zoomed out: a circle sized by how many, red if any needs attention, amber
 * if any is partly blocked, otherwise green, with the count on it. Its casing matches the drains'.
 */
export function drainClusterLayers(palette: MapPalette) {
  const isCluster: ExpressionSpecification = ["has", "point_count"];
  const circles: LayerProps = {
    id: DRAIN_CLUSTER_LAYER,
    type: "circle",
    filter: isCluster,
    paint: {
      "circle-color": ["case", [">", ["get", "bad"], 0], palette.drain.bad, [">", ["get", "warn"], 0], palette.drain.warn, palette.drain.good],
      "circle-radius": ["step", ["get", "point_count"], 11, 10, 14, 50, 18],
      "circle-stroke-color": palette.drainCasing,
      "circle-stroke-width": 2,
    },
  };
  const counts: LayerProps = {
    id: "drainage-cluster-count",
    type: "symbol",
    filter: isCluster,
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 11,
      "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
      "text-allow-overlap": true,
    },
    paint: { "text-color": palette.drainCasing },
  };
  return { circles, counts };
}

/** The walk in progress, in the draft colour: its ring (a flood), its path, each point, and where you are. */
export function draftLayers(palette: MapPalette) {
  const vertex: ExpressionSpecification = ["==", ["get", "role"], "vertex"];
  const draftFill: LayerProps = { id: "survey-draft-fill", type: "fill", filter: isPolygon, paint: { "fill-color": palette.draft, "fill-opacity": 0.25 } };
  const draftOutline: LayerProps = {
    id: "survey-draft-outline",
    type: "line",
    filter: ["any", isPolygon, isLine],
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": palette.draft, "line-width": 3, "line-dasharray": [1.5, 1.2] },
  };
  const draftVertices: LayerProps = {
    id: "survey-draft-vertices",
    type: "circle",
    filter: ["all", isPoint, vertex],
    paint: { "circle-color": palette.draft, "circle-radius": 4, "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 },
  };
  const draftMe: LayerProps = {
    id: "survey-draft-me",
    type: "circle",
    filter: ["all", isPoint, ["==", ["get", "role"], "me"]],
    paint: { "circle-color": palette.you, "circle-radius": 7, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 },
  };
  return { draftFill, draftOutline, draftVertices, draftMe };
}
