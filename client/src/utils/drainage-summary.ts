import type { DrainageSummary, DrainageSummaryItem } from "../types/field-survey.types";
import { DRAINAGE_KIND_LABEL } from "./field-survey";
import { formatDate } from "./formatDate";
import { formatDistance } from "./geo-distance";
import { MAP_PATH, writeMapView } from "./map-url";

/** The street-level view that shows a recorded drain on the main map (the Drainage layer is on by default). */
export function drainOnMapLink(item: Pick<DrainageSummaryItem, "longitude" | "latitude">): string {
  return `${MAP_PATH}?${writeMapView(new URLSearchParams(), { longitude: item.longitude, latitude: item.latitude, zoom: 17 })}`;
}

export interface DrainageFigure {
  label: string;
  value: string;
  /** Set when the figure is a problem to look at, so the card can colour it. */
  alert?: boolean;
}

/** The figures at the top of a place's drainage: how much there is, and how much of it isn't carrying water. A place with none has none to show. */
export function drainageFigures(summary: DrainageSummary): DrainageFigure[] {
  if (summary.total === 0) return [];
  return [
    { label: "Recorded", value: summary.total.toLocaleString("en") },
    { label: "Need attention", value: summary.needAttention.toLocaleString("en"), alert: summary.needAttention > 0 },
    { label: "Partly blocked", value: summary.partlyBlocked.toLocaleString("en") },
    { label: "Clear", value: summary.clear.toLocaleString("en") },
  ];
}

/**
 * "Open drain or channel · 120 m long · 1.2 m wide · Phward 2 · checked 30 Oct 2026": the second line of a
 * drain in the list. On a ward's own page every drain is in that ward, so `showWard` is turned off there.
 */
export function describeDrainItem(item: DrainageSummaryItem, showWard = true): string {
  return [
    DRAINAGE_KIND_LABEL[item.kind],
    item.lengthM !== null ? `${formatDistance(item.lengthM)} long` : null,
    item.widthM !== null ? `${item.widthM} m wide` : null,
    item.depthM !== null ? `${item.depthM} m deep` : null,
    showWard ? item.wardName : null,
    `checked ${formatDate(item.lastCheckedAt)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}
