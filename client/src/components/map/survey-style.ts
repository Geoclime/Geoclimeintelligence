import type { ExpressionSpecification } from "mapbox-gl";
import type { LayerProps } from "react-map-gl/mapbox";
import type { MapPalette } from "./map-style";

/**
 * Layers for field survey: the floods and drains responders recorded, and the walk in progress. Ids
 * are exported because the map listens to some of them for clicks (see SURVEY_INTERACTIVE_LAYERS).
 */

/** The shapes a click can open: a flood, a drain's line (through a wide invisible strip, so a thin drain can be tapped), a drain's spot. */
export const SURVEY_INTERACTIVE_LAYERS = ["flood-extent-fill", "drainage-hit", "drainage-points"];

const isPolygon: ExpressionSpecification = ["==", ["geometry-type"], "Polygon"];
const isLine: ExpressionSpecification = ["==", ["geometry-type"], "LineString"];
const isPoint: ExpressionSpecification = ["==", ["geometry-type"], "Point"];

/** Green when clear, amber when partly blocked, red when water is not getting through. */
function conditionColour(palette: MapPalette): ExpressionSpecification {
  return ["match", ["get", "condition"], "clear", palette.drain.good, "partly_blocked", palette.drain.warn, palette.drain.bad];
}

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
  const drainLine: LayerProps = {
    id: "drainage-line",
    type: "line",
    filter: isLine,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": conditionColour(palette), "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 5] },
  };
  const drainPoints: LayerProps = {
    id: "drainage-points",
    type: "circle",
    filter: isPoint,
    paint: {
      "circle-color": conditionColour(palette),
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 16, 8],
      "circle-stroke-color": palette.settlementStroke,
      "circle-stroke-width": 2,
    },
  };
  return { floodFill, floodLine, floodRecededLine, drainHit, drainLine, drainPoints };
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
