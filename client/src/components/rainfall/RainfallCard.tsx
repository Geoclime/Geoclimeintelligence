import { useMemo, useState } from "react";
import { useRainfall } from "../../hooks/useRainfall";
import type { RainfallDataType } from "../../types/rainfall.types";
import {
  formatMm,
  formatYearMonth,
  monthName,
  monthsOfYear,
  percentAgainst,
  summariseRainfall,
  totalOf,
  yearTotals,
  type MonthComparison,
} from "../../utils/rainfall-summary";
import { SourceBadge } from "../map/SourceBadge";
import { Badge } from "../shared/Badge";
import { EmptyState } from "../shared/EmptyState";
import { ErrorState } from "../shared/ErrorState";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { SelectField } from "../shared/SelectField";
import { RainfallChart, type RainfallColumn } from "./RainfallChart";
import "./rainfall.css";

const DATA_TYPE_LABELS: Record<RainfallDataType, string> = {
  OBSERVED: "Observed",
  DERIVED: "Derived",
  MODELLED: "Modelled",
  ESTIMATED: "Estimated",
  SYNTHETIC: "Synthetic",
};

/** Which 12 months the monthly chart shows: the latest 12, or one calendar year. */
type Period = "last12" | number;

/** "12% wetter than", "8% drier than", or "close to" (within 5%) the average. */
function against(value: number | null, average: number | null, what: string, years: string | null): string | null {
  const pct = percentAgainst(value, average);
  if (pct === null) return null;
  const span = years ? ` (${years})` : "";
  if (Math.abs(pct) < 5) return `Close to ${what}${span}`;
  return `${Math.abs(pct)}% ${pct > 0 ? "wetter" : "drier"} than ${what}${span}`;
}

const span = (years: [number, number] | null) => (years ? `${years[0]}–${years[1]}` : null);

function monthColumns(months: MonthComparison[]): RainfallColumn[] {
  return months.map((m, i) => ({
    key: m.yearMonth,
    label: monthName(m.yearMonth, "short"),
    sublabel: i === 0 || m.yearMonth.endsWith("-01") ? m.yearMonth.slice(0, 4) : undefined,
    valueMm: m.rainfallMm,
    averageMm: m.averageMm,
    title: formatYearMonth(m.yearMonth),
  }));
}

/**
 * An area's rainfall on its profile page: the latest month and the last 12 months against
 * their usual levels; any year's (or the latest 12) months as a chart with a table view; every
 * year's total, where clicking a year shows its months; and where the numbers come from. An
 * area with no rainfall yet says so instead of showing placeholder figures.
 */
export function RainfallCard({ adminUnitId, areaName }: { adminUnitId: string; areaName: string }) {
  const { series, loading, error, refetch } = useRainfall(adminUnitId);
  const [period, setPeriod] = useState<Period>("last12");
  const summary = useMemo(() => (series ? summariseRainfall(series.months) : null), [series]);
  const totals = useMemo(() => (series ? yearTotals(series.months) : null), [series]);
  const shown = useMemo(
    () => (!series || !summary ? [] : period === "last12" ? summary.lastTwelve : monthsOfYear(series.months, period)),
    [series, summary, period],
  );

  let body;
  if (loading && !series) body = <LoadingSpinner message="Loading rainfall…" />;
  else if (error && !series) body = <ErrorState message={error} onRetry={refetch} />;
  else if (!series || !summary || !totals || series.months.length === 0) {
    body = (
      <EmptyState
        icon="layers"
        title="No rainfall yet"
        message={`No rainfall is loaded for ${areaName} yet. An administrator imports it from the CHIRPS export on the Imports page.`}
      />
    );
  } else {
    const { latest, twelveMonthTotal, averageYearTotal, averageYearSpan, incomplete } = summary;
    const first = series.months[0]!.yearMonth;
    const last = series.months.at(-1)!.yearMonth;
    const yearsNewestFirst = [...totals.years].reverse();
    const periodName = period === "last12" ? "the last 12 months" : String(period);

    // The selected period's total, against the same "average year" the year-by-year chart draws.
    let periodTotal: string;
    const shownTotal = totalOf(shown);
    const vsAverageYear = (total: number) => against(total, averageYearTotal, "an average year", span(averageYearSpan)) ?? "";
    if (period === "last12") {
      periodTotal =
        shownTotal === null
          ? "Some of the last 12 months have no value, so there's no total."
          : `Last 12 months: ${formatMm(shownTotal)}. ${vsAverageYear(shownTotal)}`;
    } else {
      const year = totals.years.find((y) => y.year === period);
      periodTotal =
        year && year.totalMm !== null
          ? `${period} total: ${formatMm(year.totalMm)}. ${vsAverageYear(year.totalMm)}`
          : `${period} so far: ${formatMm(year?.partialMm ?? 0)} over ${year?.monthsWithValue ?? 0} months. The year isn't complete, so it isn't compared.`;
    }

    const yearColumns: RainfallColumn[] = totals.years.map((y) => ({
      key: String(y.year),
      label: String(y.year),
      valueMm: y.totalMm,
      averageMm: totals.averageMm,
      title: y.totalMm === null ? `${y.year} (incomplete)` : `${y.year} total`,
      missingText: `${formatMm(y.partialMm)} over ${y.monthsWithValue} months so far`,
    }));

    body = (
      <>
        <div className="stat-grid" data-cy="rainfall-stats">
          {latest && latest.rainfallMm !== null && (
            <div className="card stat">
              <span className="stat__label">{formatYearMonth(latest.yearMonth)}</span>
              <span className="stat__value">{formatMm(latest.rainfallMm)}</span>
              <span className="rainfall-card__delta">
                {against(latest.rainfallMm, latest.averageMm, `an average ${monthName(latest.yearMonth)}`, span(latest.averageYears)) ??
                  "Not enough years yet to compare"}
              </span>
            </div>
          )}
          <div className="card stat">
            <span className="stat__label">Last 12 months</span>
            {twelveMonthTotal !== null ? (
              <>
                <span className="stat__value">{formatMm(twelveMonthTotal)}</span>
                <span className="rainfall-card__delta">
                  {against(twelveMonthTotal, averageYearTotal, "an average year", span(averageYearSpan)) ?? "Not enough full years yet to compare"}
                </span>
              </>
            ) : (
              <span className="stat__value stat__value--muted">Some months missing</span>
            )}
          </div>
          <div className="card stat">
            <span className="stat__label">On record</span>
            <span className="stat__value">{series.months.length.toLocaleString("en")} months</span>
            <span className="rainfall-card__delta">
              {formatYearMonth(first, "short")} to {formatYearMonth(last, "short")}
            </span>
          </div>
        </div>

        <div className="rainfall-card__chart-header">
          <div>
            <h3 className="rainfall-card__section-title">Month by month</h3>
            <p className="rainfall-card__section-lead">Each month against the same month in the other years.</p>
          </div>
          <SelectField
            label="Show"
            className="rainfall-card__period"
            value={String(period)}
            onChange={(event) => setPeriod(event.target.value === "last12" ? "last12" : Number(event.target.value))}
            data-cy="rainfall-period"
          >
            <option value="last12">Last 12 months</option>
            {yearsNewestFirst.map((y) => (
              <option key={y.year} value={y.year}>
                {y.year}
                {y.totalMm === null ? " (incomplete)" : ""}
              </option>
            ))}
          </SelectField>
        </div>

        <RainfallChart
          columns={monthColumns(shown)}
          valueLabel="Monthly rainfall"
          averageLabel={shown.some((m) => m.averageMm !== null) ? "Average for the month (other years)" : null}
          ariaLabel={`Monthly rainfall for ${periodName}, with each month's average. The same values are in the table below.`}
        />
        <p className="rainfall-card__period-total" data-cy="rainfall-period-total">
          {periodTotal}
        </p>

        {incomplete.length > 0 && (
          <p className="rainfall-card__note" data-cy="rainfall-incomplete">
            {incomplete.map((m) => formatYearMonth(m)).join(", ")} {incomplete.length === 1 ? "is" : "are"} not complete in the source yet, so{" "}
            {incomplete.length === 1 ? "it has" : "they have"} no value. A later import fills {incomplete.length === 1 ? "it" : "them"} in.
          </p>
        )}

        <details className="rainfall-card__table">
          <summary>Show {periodName} as a table</summary>
          <div className="data-table__scroll">
            <table className="data-table">
              <caption className="visually-hidden">
                Monthly rainfall for {areaName}, {periodName}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col" className="data-table__numeric">
                    Rainfall
                  </th>
                  <th scope="col" className="data-table__numeric">
                    Average for the month
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...shown].reverse().map((m) => (
                  <tr key={m.yearMonth}>
                    <td data-label="Month">{formatYearMonth(m.yearMonth)}</td>
                    <td data-label="Rainfall" className="data-table__numeric">
                      {m.rainfallMm === null ? <span className="muted">No value</span> : formatMm(m.rainfallMm)}
                    </td>
                    <td data-label="Average for the month" className="data-table__numeric">
                      {m.averageMm === null ? <span className="muted">Not enough years</span> : formatMm(m.averageMm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <h3 className="rainfall-card__section-title">Year by year</h3>
        <p className="rainfall-card__section-lead">Each year's total. Choose a year to see its months above.</p>
        <RainfallChart
          columns={yearColumns}
          valueLabel="Yearly total"
          averageLabel={totals.averageMm === null ? null : `Average year (${span(totals.averageYears)})`}
          ariaLabel={`Yearly rainfall totals for ${areaName}. The same values are in the table below.`}
          onSelect={(key) => setPeriod(Number(key))}
          selectedKey={period === "last12" ? null : String(period)}
        />
        <details className="rainfall-card__table">
          <summary>Show every year as a table</summary>
          <div className="data-table__scroll">
            <table className="data-table" data-cy="rainfall-years">
              <caption className="visually-hidden">Yearly rainfall totals for {areaName}</caption>
              <thead>
                <tr>
                  <th scope="col">Year</th>
                  <th scope="col" className="data-table__numeric">
                    Total
                  </th>
                  <th scope="col">Against an average year</th>
                </tr>
              </thead>
              <tbody>
                {yearsNewestFirst.map((y) => (
                  <tr key={y.year}>
                    <td data-label="Year">{y.year}</td>
                    <td data-label="Total" className="data-table__numeric">
                      {y.totalMm === null ? (
                        <span className="muted">
                          {formatMm(y.partialMm)} over {y.monthsWithValue} months
                        </span>
                      ) : (
                        formatMm(y.totalMm)
                      )}
                    </td>
                    <td data-label="Against an average year">
                      {y.totalMm === null ? (
                        <span className="muted">Incomplete year</span>
                      ) : (
                        (against(y.totalMm, totals.averageMm, "average", null) ?? <span className="muted">Not enough years</span>)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <div className="rainfall-card__sources">
          {series.dataTypes.map((type) => (
            <Badge key={type} tone="neutral">
              {DATA_TYPE_LABELS[type]}
            </Badge>
          ))}
          {series.sources.map((source) => (
            <SourceBadge key={source.id} source={source} />
          ))}
        </div>
      </>
    );
  }

  return (
    <section className="card" aria-labelledby="rainfall-title" data-cy="rainfall-card">
      <div className="card__header">
        <div>
          <h2 id="rainfall-title" className="card__title">
            Rainfall
          </h2>
          <p className="card__subtitle">Mean monthly rainfall over {areaName}, against the same month in other years.</p>
        </div>
      </div>
      <div className="card__body">{body}</div>
    </section>
  );
}
