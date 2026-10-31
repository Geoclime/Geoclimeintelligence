import type { FloodHistory, FloodHistoryItem } from "../types/field-survey.types";
import { formatDate } from "./formatDate";
import { MAP_PATH, writeMapView } from "./map-url";
import { formatArea } from "./survey-geometry";
import { WATER_DEPTH_INFO } from "./water-depth";

/** The street-level view that shows a recorded flood on the main map (the Floods layer is on by default). */
export function floodOnMapLink(item: Pick<FloodHistoryItem, "longitude" | "latitude">): string {
  return `${MAP_PATH}?${writeMapView(new URLSearchParams(), { longitude: item.longitude, latitude: item.latitude, zoom: 15 })}`;
}

/** The four figures at the top of a place's flood history. A place with no floods has none to show. */
export function historyFigures(history: FloodHistory): { label: string; value: string }[] {
  if (history.total === 0) return [];
  return [
    { label: "Recorded", value: history.total.toLocaleString("en") },
    { label: "Still active", value: history.active.toLocaleString("en") },
    { label: "Largest", value: formatArea(history.largestAreaM2) },
    { label: "Latest", value: formatDate(history.latestAt) },
  ];
}

/**
 * "Knee-deep · Phward 2 · Walked with GPS · receded 2 Nov 2026": the second line of a flood in the list.
 * On a ward's own page every flood is in that ward, so `showWard` is turned off there.
 */
export function describeHistoryItem(item: FloodHistoryItem, showWard = true): string {
  return [
    item.depth ? WATER_DEPTH_INFO[item.depth].label : null,
    showWard ? item.wardName : null,
    item.method === "walked" ? "Walked with GPS" : "Drawn on the map",
    item.recededAt ? `receded ${formatDate(item.recededAt)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
