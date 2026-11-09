import type { AreaSatelliteFloodMonth, SatelliteFloodLayer } from "../types/satellite-flood.types";
import { MAP_PATH, readLayers, writeFloodMonth, writeLayers } from "./map-url";
import { addMonths, formatYearMonth } from "./rainfall-summary";

/** km² for display: whole numbers with separators, one decimal under 10, two under 1 (a ward's creek). */
export function formatKm2(km2: number): string {
  return km2.toLocaleString("en", { maximumFractionDigits: km2 < 1 ? 2 : km2 < 10 ? 1 : 0 });
}

/** The legend row for the month shown, painted in the picture's own colour. */
export function satelliteFloodLegend(layer: SatelliteFloodLayer) {
  return [{ key: "satellite-flood", label: `Water seen by satellite, ${formatYearMonth(layer.yearMonth)}`, swatch: "satellite-flood", color: layer.colour }];
}

/**
 * What the layer is, in one line under the legend: who made it, and what "water" means here, so it
 * is never read as only the flood (it includes rivers and creeks) or as more precise than it is.
 */
export function satelliteFloodNote(layer: SatelliteFloodLayer): string {
  const { provider, datasetName, license } = layer.source;
  return (
    `Satellite water: ${provider}, ${datasetName} (${license}). Open water Sentinel-1 radar saw in ${formatYearMonth(layer.yearMonth)}, ` +
    `about ${Math.round(layer.pixelMetres)} m a pixel. It includes rivers and creeks, and can mistake smooth dry ground for water.`
  );
}

const MIN_YEARS = 2;

/** One month of an area's water beside the same calendar month in its other years. */
export interface AreaWaterMonth {
  yearMonth: string;
  /** Null when that month hasn't been imported. */
  floodedKm2: number | null;
  percentFlooded: number | null;
  measuredKm2: number | null;
  /** The mean for the same calendar month in the other years; null with fewer than two of them. */
  averageKm2: number | null;
}

export interface AreaWaterSummary {
  latest: AreaWaterMonth;
  /** The month with the most water on record. */
  most: AreaSatelliteFloodMonth;
  /** The 12 calendar months ending at the latest one, gaps included. */
  lastTwelve: AreaWaterMonth[];
  /** Years with at least one month, newest first. */
  years: number[];
  first: string;
  last: string;
  count: number;
}

function comparer(months: AreaSatelliteFloodMonth[]): (yearMonth: string) => AreaWaterMonth {
  const byMonth = new Map(months.map((m) => [m.yearMonth, m]));
  return (yearMonth) => {
    const others = months.filter((m) => m.yearMonth.slice(5) === yearMonth.slice(5) && m.yearMonth !== yearMonth);
    const own = byMonth.get(yearMonth);
    return {
      yearMonth,
      floodedKm2: own?.floodedKm2 ?? null,
      percentFlooded: own?.percentFlooded ?? null,
      measuredKm2: own?.measuredKm2 ?? null,
      averageKm2: others.length >= MIN_YEARS ? others.reduce((sum, m) => sum + m.floodedKm2, 0) / others.length : null,
    };
  };
}

/**
 * What the satellite water card says about an area, from its months oldest first (as the API sends
 * them): the latest month, the month with the most water, and the last 12. Null when nothing is live.
 */
export function summariseAreaWater(months: AreaSatelliteFloodMonth[]): AreaWaterSummary | null {
  if (months.length === 0) return null;
  const compare = comparer(months);
  const last = months.at(-1)!.yearMonth;
  const most = months.reduce((top, m) => (m.floodedKm2 > top.floodedKm2 ? m : top));
  const years = [...new Set(months.map((m) => Number(m.yearMonth.slice(0, 4))))].sort((a, b) => b - a);
  return {
    latest: compare(last),
    most,
    lastTwelve: Array.from({ length: 12 }, (_, i) => compare(addMonths(last, i - 11))),
    years,
    first: months[0]!.yearMonth,
    last,
    count: months.length,
  };
}

/** January to December of one year, gaps included. */
export function areaWaterYear(months: AreaSatelliteFloodMonth[], year: number): AreaWaterMonth[] {
  const compare = comparer(months);
  return Array.from({ length: 12 }, (_, i) => compare(`${year}-${String(i + 1).padStart(2, "0")}`));
}

/** The home map with the satellite layer on at one month, zoomed to an LGA when one is given. */
export function satelliteFloodMapHref(lgaId: string | null, yearMonth: string): string {
  let params = new URLSearchParams();
  if (lgaId) params.set("lga", lgaId);
  params = writeLayers(params, { ...readLayers(new URLSearchParams()), satelliteFlood: true });
  return `${MAP_PATH}?${writeFloodMonth(params, yearMonth).toString()}`;
}
