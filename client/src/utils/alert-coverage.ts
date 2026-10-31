import type { AdminUnitSummary } from "../types/admin-unit.types";
import { areaTitle, listAreas } from "./area-title";

export interface AlertCoverage {
  /** Whole states chosen: each covers every LGA in it. */
  states: AdminUnitSummary[];
  /** LGAs chosen that are not inside a chosen state. */
  looseLgas: AdminUnitSummary[];
  /** How many LGAs the alert reaches in all. */
  lgaCount: number;
}

/**
 * What the chosen areas add up to. A state covers every LGA in it, so an LGA inside a chosen state
 * adds nothing: choosing "Rivers State" and two of its LGAs is the whole state, not two LGAs.
 */
export function alertCoverage(chosen: AdminUnitSummary[]): AlertCoverage {
  const states = chosen.filter((unit) => unit.level === 1);
  const stateIds = new Set(states.map((state) => state.id));
  const looseLgas = chosen.filter((unit) => unit.level === 2 && !(unit.parentId && stateIds.has(unit.parentId)));
  return { states, looseLgas, lgaCount: states.reduce((sum, state) => sum + state.childCount, 0) + looseLgas.length };
}

const lgas = (count: number) => `${count} ${count === 1 ? "LGA" : "LGAs"}`;

/** "Covers all 23 LGAs in Rivers State.", "Covers 2 LGAs." Empty while nothing is chosen. */
export function describeCoverage({ states, looseLgas, lgaCount }: AlertCoverage): string {
  if (lgaCount === 0 && states.length === 0) return "";
  if (states.length === 0) return `Covers ${lgas(lgaCount)}.`;
  const names = listAreas(states.map((state) => areaTitle(state.unitName, state.levelName)));
  if (looseLgas.length === 0 && states.length === 1) return `Covers all ${lgas(lgaCount)} in ${names}.`;
  const others = looseLgas.length > 0 ? ` and ${lgas(looseLgas.length)} elsewhere` : "";
  return `Covers ${lgas(lgaCount)}: every LGA in ${names}${others}.`;
}
