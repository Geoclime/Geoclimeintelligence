import { describe, expect, it } from "vitest";
import type { RainfallMonth } from "../types/rainfall.types";
import { formatMm, formatYearMonth, monthName, monthsOfYear, percentAgainst, summariseRainfall, totalOf, yearTotals } from "./rainfall-summary";

/** Every month of the given years at `mm`, plus extra months. */
function years(from: number, to: number, mm: (year: number, month: number) => number): RainfallMonth[] {
  const months: RainfallMonth[] = [];
  for (let y = from; y <= to; y++) {
    for (let m = 1; m <= 12; m++) months.push({ yearMonth: `${y}-${String(m).padStart(2, "0")}`, rainfallMm: mm(y, m) });
  }
  return months;
}

describe("summariseRainfall", () => {
  it("compares the latest month with the same month in the other years, and the last 12 months with an average year", () => {
    const months = [
      ...years(2016, 2018, (_y, m) => m * 10),
      { yearMonth: "2019-01", rainfallMm: 20 },
      { yearMonth: "2019-02", rainfallMm: null },
    ];
    const summary = summariseRainfall(months);
    // Latest with a value is January 2019; the January average of 2016-2018 is 10.
    expect(summary.latest).toEqual({ yearMonth: "2019-01", rainfallMm: 20, averageMm: 10, averageYears: [2016, 2018] });
    expect(summary.lastTwelve.map((m) => m.yearMonth)).toEqual([
      "2018-02", "2018-03", "2018-04", "2018-05", "2018-06", "2018-07", "2018-08", "2018-09", "2018-10", "2018-11", "2018-12", "2019-01",
    ]);
    // February-December 2018 (20..120 = 770) plus January 2019 (20).
    expect(summary.twelveMonthTotal).toBe(790);
    expect(summary.averageYearTotal).toBe(780);
    expect(summary.averageYearSpan).toEqual([2016, 2018]);
    expect(summary.incomplete).toEqual(["2019-02"]);
    // A month's average leaves its own year out.
    expect(summary.lastTwelve[0]).toMatchObject({ yearMonth: "2018-02", averageMm: 20, averageYears: [2016, 2017] });
  });

  it("gives no averages without two years behind them, and no total with a gap in the 12 months", () => {
    const summary = summariseRainfall([
      { yearMonth: "2026-07", rainfallMm: 420 },
      { yearMonth: "2026-08", rainfallMm: 304 },
    ]);
    expect(summary.latest).toMatchObject({ yearMonth: "2026-08", averageMm: null, averageYears: null });
    expect(summary.lastTwelve[0]).toMatchObject({ yearMonth: "2025-09", rainfallMm: null });
    expect(summary.twelveMonthTotal).toBeNull();
    expect(summary.averageYearTotal).toBeNull();
  });

  it("has nothing to say about an empty series", () => {
    expect(summariseRainfall([])).toMatchObject({ latest: null, lastTwelve: [], twelveMonthTotal: null, incomplete: [] });
  });
});

describe("other years", () => {
  const months = [...years(2016, 2018, (y, m) => (y === 2018 ? 20 : 10) * m), { yearMonth: "2019-01", rainfallMm: 5 }, { yearMonth: "2019-02", rainfallMm: null }];

  it("puts any year's 12 months beside their averages, leaving months the series doesn't have empty", () => {
    const year = monthsOfYear(months, 2018);
    expect(year.map((m) => m.yearMonth)).toHaveLength(12);
    // March 2018 is 60; the March average of 2016, 2017 and 2019 (no 2019 March) is 30.
    expect(year[2]).toEqual({ yearMonth: "2018-03", rainfallMm: 60, averageMm: 30, averageYears: [2016, 2017] });
    expect(totalOf(year)).toBe(1560);
    const partial = monthsOfYear(months, 2019);
    expect(partial.map((m) => m.rainfallMm).slice(0, 3)).toEqual([5, null, null]);
    expect(totalOf(partial)).toBeNull();
  });

  it("totals each year, counts only complete years towards an average year, and keeps a year in progress as partial", () => {
    const totals = yearTotals(months);
    expect(totals.years).toEqual([
      { year: 2016, totalMm: 780, partialMm: 780, monthsWithValue: 12 },
      { year: 2017, totalMm: 780, partialMm: 780, monthsWithValue: 12 },
      { year: 2018, totalMm: 1560, partialMm: 1560, monthsWithValue: 12 },
      { year: 2019, totalMm: null, partialMm: 5, monthsWithValue: 1 },
    ]);
    expect(totals.averageMm).toBe(1040);
    expect(totals.averageYears).toEqual([2016, 2018]);
  });
});

describe("formatting", () => {
  it("names months in UTC and rounds millimetres and percentages", () => {
    expect(formatYearMonth("2026-08")).toBe("August 2026");
    expect(formatYearMonth("2026-01", "short")).toBe("Jan 2026");
    expect(monthName("2026-09")).toBe("September");
    expect(formatMm(2654.4)).toBe("2,654 mm");
    expect(formatMm(4.27)).toBe("4.3 mm");
    expect(percentAgainst(112, 100)).toBe(12);
    expect(percentAgainst(88, 100)).toBe(-12);
    expect(percentAgainst(5, null)).toBeNull();
  });
});
