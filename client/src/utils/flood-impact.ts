import type { FloodImpact } from "../types/field-survey.types";
import { formatDistance } from "./geo-distance";

/** "a", "a and b", "a, b and c". */
export function joinList(items: readonly string[]): string {
  if (items.length <= 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

/**
 * What a flood reaches, in one sentence for the top of its popup: "Reaches 142 buildings, 2 facilities
 * and 320 m of road". Only what is there is named; a flood that touches none of them says so, which may
 * just mean the buildings layer isn't loaded for that area.
 */
export function impactHeadline(impact: FloodImpact): string {
  const parts: string[] = [];
  if (impact.buildings > 0) parts.push(count(impact.buildings, "building", "buildings"));
  if (impact.facilities.total > 0) parts.push(count(impact.facilities.total, "facility", "facilities"));
  if (impact.roadMetres > 0) parts.push(`${formatDistance(impact.roadMetres)} of road`);
  return parts.length > 0 ? `Reaches ${joinList(parts)}` : "No buildings, facilities or roads found inside it";
}

/** The drains beside a flood, as the line that sends someone to look: null when there are none. */
export function drainsHeadline(drains: FloodImpact["drains"], withinMetres: number): string | null {
  if (drains.total === 0) return null;
  const near = `${count(drains.total, "drain", "drains")} within ${withinMetres} m`;
  if (drains.needAttention === 0) return `${near}, none blocked`;
  return `${near}, ${drains.needAttention} ${drains.needAttention === 1 ? "needs" : "need"} attention`;
}

/** The distance a drain counts as "near" a flood. Mirrors SURVEY_LIMITS.nearbyDrainMetres on the server. */
export const NEARBY_DRAIN_METRES = 150;
