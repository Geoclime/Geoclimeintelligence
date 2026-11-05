import type { PublicFloodPoint } from "../types/public.types";
import { formatArea } from "./survey-geometry";
import { WATER_DEPTH_INFO } from "./water-depth";

/**
 * How big to draw a recorded flood on the national alert map. The map is the whole state, so even a
 * large flood is a few pixels across: it is drawn as a marker whose size only hints at the area
 * (about 5 px for a puddle-sized patch, 9 px for a hectare, never more than 12 px), on a log scale
 * because areas run from a few hundred square metres to square kilometres.
 */
export function floodMarkerRadius(areaM2: number): number {
  const radius = 3 + Math.log10(Math.max(areaM2, 10)) * 1.6;
  return Math.round(Math.min(12, Math.max(5, radius)) * 10) / 10;
}

/** "Flood recorded on the ground: 3.2 ha, knee-deep, in Obio/Akpor": what the marker says when hovered, and to a screen reader. */
export function describeFlood(flood: PublicFloodPoint): string {
  const parts = [formatArea(flood.areaM2)];
  if (flood.depth) parts.push(WATER_DEPTH_INFO[flood.depth].label.toLowerCase());
  return `Flood recorded on the ground: ${parts.join(", ")}${flood.lgaName ? `, in ${flood.lgaName}` : ""}`;
}

/** The largest flood's area, for a headline; 0 when there are none. */
export function largestFloodArea(floods: readonly PublicFloodPoint[]): number {
  return floods.reduce((largest, flood) => Math.max(largest, flood.areaM2), 0);
}
