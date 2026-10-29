import type { RainfallMonth } from "../types/rainfall.types";

/** One month beside its usual level: the same calendar month's mean in the other years. */
export interface MonthComparison {
  /** "YYYY-MM". */
  yearMonth: string;
  /** Null when the month is missing or incomplete. */
  rainfallMm: number | null;
  /** Null with fewer than two other years to average. */
  averageMm: number | null;
  /** The first and last year in that average. */
  averageYears: [number, number] | null;
}

export interface RainfallSummary {
  /** The latest month with a value, against its average. */
  latest: MonthComparison | null;
  /** The 12 months ending at `latest`, oldest first (a missing month has a null value). */
  lastTwelve: MonthComparison[];
  /** Their total; null if any of the 12 has no value. */
  twelveMonthTotal: number | null;
  /** The mean total of the complete calendar years in the series; null with fewer than two. */
  averageYearTotal: number | null;
  averageYearSpan: [number, number] | null;
  /** Months stored without a value (the source hadn't finished them), oldest first. */
  incomplete: string[];
}

const MIN_YEARS = 2;

function addMonths(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split("-").map(Number) as [number, number];
  const index = y * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Works out what the rainfall card says from an area's series: how the latest month compares
 * with the same month in other years, how the last 12 months compare with an average year,
 * and which months are incomplete. Nothing is invented: a missing value stays null, and an
 * average needs at least two years behind it.
 */
export function summariseRainfall(months: RainfallMonth[]): RainfallSummary {
  const compare = comparer(months);
  const latestMonth = months.filter((m) => m.rainfallMm !== null).at(-1)?.yearMonth ?? null;
  const lastTwelve = latestMonth ? Array.from({ length: 12 }, (_, i) => compare(addMonths(latestMonth, i - 11))) : [];
  const { averageMm, averageYears } = yearTotals(months);

  return {
    latest: latestMonth ? compare(latestMonth) : null,
    lastTwelve,
    twelveMonthTotal: totalOf(lastTwelve),
    averageYearTotal: averageMm,
    averageYearSpan: averageYears,
    incomplete: months.filter((m) => m.rainfallMm === null).map((m) => m.yearMonth),
  };
}

/** Puts any month beside the same calendar month's mean in the series' other years. */
function comparer(months: RainfallMonth[]): (yearMonth: string) => MonthComparison {
  const byMonth = new Map(months.map((m) => [m.yearMonth, m.rainfallMm]));
  const complete = months.filter((m): m is { yearMonth: string; rainfallMm: number } => m.rainfallMm !== null);
  return (yearMonth) => {
    const [year, month] = [yearMonth.slice(0, 4), yearMonth.slice(5)];
    const others = complete.filter((m) => m.yearMonth.slice(5) === month && m.yearMonth.slice(0, 4) !== year);
    const years = others.map((m) => Number(m.yearMonth.slice(0, 4)));
    return {
      yearMonth,
      rainfallMm: byMonth.get(yearMonth) ?? null,
      averageMm: others.length >= MIN_YEARS ? mean(others.map((m) => m.rainfallMm)) : null,
      averageYears: others.length >= MIN_YEARS ? [Math.min(...years), Math.max(...years)] : null,
    };
  };
}

/** The total of a run of months; null if any of them has no value. */
export function totalOf(months: MonthComparison[]): number | null {
  return months.length > 0 && months.every((m) => m.rainfallMm !== null) ? months.reduce((sum, m) => sum + m.rainfallMm!, 0) : null;
}

/** January to December of one year, each against its average. Months not in the series have no value. */
export function monthsOfYear(months: RainfallMonth[], year: number): MonthComparison[] {
  const compare = comparer(months);
  return Array.from({ length: 12 }, (_, i) => compare(`${year}-${String(i + 1).padStart(2, "0")}`));
}

export interface YearTotal {
  year: number;
  /** The year's total; null unless all 12 months have a value. */
  totalMm: number | null;
  /** What the year has so far, and over how many months, for a year still in progress. */
  partialMm: number;
  monthsWithValue: number;
}

/**
 * Every year in the series, oldest first, with its total, and the mean total of the complete
 * years (at least two) as the "average year".
 */
export function yearTotals(months: RainfallMonth[]): { years: YearTotal[]; averageMm: number | null; averageYears: [number, number] | null } {
  const byYear = new Map<number, number[]>();
  for (const m of months) {
    const year = Number(m.yearMonth.slice(0, 4));
    const values = byYear.get(year) ?? [];
    if (m.rainfallMm !== null) values.push(m.rainfallMm);
    byYear.set(year, values);
  }
  const years = [...byYear]
    .sort(([a], [b]) => a - b)
    .map(([year, values]) => {
      const sum = values.reduce((a, b) => a + b, 0);
      return { year, totalMm: values.length === 12 ? sum : null, partialMm: sum, monthsWithValue: values.length };
    });
  const full = years.filter((y) => y.totalMm !== null);
  const enough = full.length >= MIN_YEARS;
  return {
    years,
    averageMm: enough ? mean(full.map((y) => y.totalMm!)) : null,
    averageYears: enough ? [full[0]!.year, full.at(-1)!.year] : null,
  };
}

/** Signed percentage difference, rounded: +12, -8, 0. Null without an average. */
export function percentAgainst(value: number | null, average: number | null): number | null {
  if (value === null || average === null || average === 0) return null;
  return Math.round(((value - average) / average) * 100);
}

/** "2026-08" -> "August 2026" (or "Aug 2026" short). The month is read in UTC, so no time zone shifts it. */
export function formatYearMonth(yearMonth: string, style: "long" | "short" = "long"): string {
  const [y, m] = yearMonth.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: style, year: "numeric", timeZone: "UTC" });
}

/** "2026-08" -> "August". */
export function monthName(yearMonth: string, style: "long" | "short" = "long"): string {
  const m = Number(yearMonth.slice(5));
  return new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString("en-GB", { month: style, timeZone: "UTC" });
}

/** Millimetres for display: whole numbers with separators ("2,654 mm"), one decimal under 10. */
export function formatMm(value: number): string {
  return `${value.toLocaleString("en", { maximumFractionDigits: value < 10 ? 1 : 0 })} mm`;
}
