import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useAreaSatelliteFlood, useSatelliteFlood } from "../../hooks/useSatelliteFlood";
import type { DataSource } from "../../types/data-source.types";
import { formatYearMonth, monthName, percentAgainst } from "../../utils/rainfall-summary";
import { areaWaterYear, formatKm2, satelliteFloodMapHref, summariseAreaWater, type AreaWaterMonth } from "../../utils/satellite-flood";
import { SourceBadge } from "../map/SourceBadge";
import { RainfallChart, type RainfallColumn } from "../rainfall/RainfallChart";
import "../rainfall/rainfall.css";
import { Badge } from "../shared/Badge";
import { buttonClassName } from "../shared/Button";
import { EmptyState } from "../shared/EmptyState";
import { SelectField } from "../shared/SelectField";
import "./satellite-water.css";

/** Which 12 months the chart shows: the latest 12, or one calendar year. */
type Period = "last12" | number;

const km2 = (value: number) => `${formatKm2(value)} km²`;

/** "40% more than an average August", or null when there aren't two other years to compare with. */
function againstAverage(month: AreaWaterMonth): string | null {
  const pct = percentAgainst(month.floodedKm2, month.averageKm2);
  if (pct === null) return null;
  const what = `an average ${monthName(month.yearMonth)}`;
  if (Math.abs(pct) < 5) return `Close to ${what}`;
  return `${Math.abs(pct)}% ${pct > 0 ? "more" : "less"} than ${what}`;
}

function columns(months: AreaWaterMonth[]): RainfallColumn[] {
  return months.map((m, i) => ({
    key: m.yearMonth,
    label: monthName(m.yearMonth, "short"),
    sublabel: i === 0 || m.yearMonth.endsWith("-01") ? m.yearMonth.slice(0, 4) : undefined,
    valueMm: m.floodedKm2,
    averageMm: m.averageKm2,
    title: formatYearMonth(m.yearMonth),
    missingText: "Not imported",
  }));
}

/**
 * Open water the Sentinel-1 satellite saw over an LGA or ward, month by month, from the imported
 * monthly tiles: the latest month and the month with the most water, a chart against the same
 * month in other years, a table where each month opens the home map at that month, and the source.
 *
 * It says what the figure is in so many words: derived from radar, including rivers and creeks that
 * are always there, and liable to read smooth dry ground as water. It is shown beside, not merged
 * with, the floods responders recorded. Nothing shows if the server can't answer (for example before
 * the satellite tables exist); an area with no live month says so.
 */
export function SatelliteWaterCard({
  areaId,
  areaName,
  countryCode,
  lgaId,
}: {
  areaId: string;
  areaName: string;
  countryCode: string;
  /** The LGA the map link zooms to: the area itself on an LGA page, its parent on a ward page. */
  lgaId: string | null;
}) {
  const { water, error } = useAreaSatelliteFlood(areaId);
  const { months: liveMonths } = useSatelliteFlood(countryCode, null, false);
  const [period, setPeriod] = useState<Period>("last12");
  const summary = useMemo(() => (water ? summariseAreaWater(water.months) : null), [water]);
  const shown = useMemo(
    () => (!water || !summary ? [] : period === "last12" ? summary.lastTwelve : areaWaterYear(water.months, period)),
    [water, summary, period],
  );
  const sources = useMemo(() => {
    const byId = new Map<string, DataSource>();
    for (const month of liveMonths) byId.set(month.source.id, month.source);
    return [...byId.values()];
  }, [liveMonths]);

  if (error || !water) return null;

  const header = (
    <div className="card__header">
      <div>
        <h2 id={`satellite-water-${areaId}`} className="card__title">
          Water seen by satellite
        </h2>
        <p className="card__subtitle">Open water the Sentinel-1 radar saw over {areaName}, month by month.</p>
      </div>
      {summary && (
        <Link to={satelliteFloodMapHref(lgaId, summary.last)} className={buttonClassName({ variant: "secondary", size: "sm" })} data-cy="satellite-water-map">
          See {formatYearMonth(summary.last, "short")} on the map
        </Link>
      )}
    </div>
  );

  if (!summary) {
    return (
      <section className="card satellite-water-card" aria-labelledby={`satellite-water-${areaId}`} data-cy="satellite-water-card">
        {header}
        <div className="card__body">
          <EmptyState
            icon="layers"
            title="No satellite water yet"
            message={`No month of satellite flood extent covers ${areaName} yet. An administrator imports the monthly tiles on the Imports page.`}
          />
        </div>
      </section>
    );
  }

  const { latest, most, years, first, last, count } = summary;
  const periodName = period === "last12" ? "the last 12 months" : String(period);
  const monthsInYear = (year: number) => water.months.filter((m) => m.yearMonth.startsWith(`${year}-`)).length;

  return (
    <section className="card satellite-water-card" aria-labelledby={`satellite-water-${areaId}`} data-cy="satellite-water-card">
      {header}
      <div className="card__body">
        <div className="stat-grid" data-cy="satellite-water-stats">
          <div className="card stat">
            <span className="stat__label">{formatYearMonth(latest.yearMonth)}</span>
            <span className="stat__value">{km2(latest.floodedKm2 ?? 0)}</span>
            <span className="rainfall-card__delta">
              {latest.percentFlooded !== null && `${latest.percentFlooded}% of the area. `}
              {againstAverage(latest) ?? "Not enough years yet to compare"}
            </span>
          </div>
          <div className="card stat">
            <span className="stat__label">Most water on record</span>
            <span className="stat__value">{km2(most.floodedKm2)}</span>
            <span className="rainfall-card__delta">
              {formatYearMonth(most.yearMonth)}
              {most.percentFlooded !== null && `, ${most.percentFlooded}% of the area`}
            </span>
          </div>
          <div className="card stat">
            <span className="stat__label">On record</span>
            <span className="stat__value">{count.toLocaleString("en")} months</span>
            <span className="rainfall-card__delta">
              {formatYearMonth(first, "short")} to {formatYearMonth(last, "short")}
            </span>
          </div>
        </div>

        <div className="rainfall-card__chart-header">
          <div>
            <h3 className="rainfall-card__section-title">Month by month</h3>
            <p className="rainfall-card__section-lead">Water in each month against the same month in the other years.</p>
          </div>
          <SelectField
            label="Show"
            className="rainfall-card__period"
            value={String(period)}
            onChange={(event) => setPeriod(event.target.value === "last12" ? "last12" : Number(event.target.value))}
            data-cy="satellite-water-period"
          >
            <option value="last12">Last 12 months</option>
            {years.map((year) => (
              <option key={year} value={year}>
                {year}
                {monthsInYear(year) < 12 ? ` (${monthsInYear(year)} months)` : ""}
              </option>
            ))}
          </SelectField>
        </div>

        <RainfallChart
          columns={columns(shown)}
          valueLabel="Water seen"
          averageLabel={shown.some((m) => m.averageKm2 !== null) ? "Average for the month (other years)" : null}
          ariaLabel={`Water seen by satellite over ${areaName} for ${periodName}, with each month's average. The same values are in the table below.`}
          unit="km²"
          format={km2}
        />

        <details className="rainfall-card__table">
          <summary>Show {periodName} as a table</summary>
          <div className="data-table__scroll">
            <table className="data-table" data-cy="satellite-water-table">
              <caption className="visually-hidden">
                Water seen by satellite over {areaName}, {periodName}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col" className="data-table__numeric">
                    Water
                  </th>
                  <th scope="col" className="data-table__numeric">
                    Share of the area
                  </th>
                  <th scope="col" className="data-table__numeric">
                    Average for the month
                  </th>
                  <th scope="col">
                    <span className="visually-hidden">Map</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...shown].reverse().map((m) => (
                  <tr key={m.yearMonth}>
                    <td data-label="Month">{formatYearMonth(m.yearMonth)}</td>
                    <td data-label="Water" className="data-table__numeric">
                      {m.floodedKm2 === null ? <span className="muted">Not imported</span> : km2(m.floodedKm2)}
                    </td>
                    <td data-label="Share of the area" className="data-table__numeric">
                      {m.percentFlooded === null ? <span className="muted">–</span> : `${m.percentFlooded}%`}
                    </td>
                    <td data-label="Average for the month" className="data-table__numeric">
                      {m.averageKm2 === null ? <span className="muted">Not enough years</span> : km2(m.averageKm2)}
                    </td>
                    <td data-label="Map">
                      {m.floodedKm2 !== null && (
                        <Link to={satelliteFloodMapHref(lgaId, m.yearMonth)} aria-label={`See ${formatYearMonth(m.yearMonth)} on the map`}>
                          Map
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <p className="rainfall-card__note" data-cy="satellite-water-caveat">
          Derived from radar, not measured on the ground. It counts all open water, including rivers and creeks that are always
          there, and smooth dry ground can read as water, so a dry-season month can show more than a flood. Compare months
          with each other rather than reading one on its own.
        </p>

        <div className="rainfall-card__sources">
          <Badge tone="neutral">Derived</Badge>
          {sources.map((source) => (
            <SourceBadge key={source.id} source={source} />
          ))}
        </div>
      </div>
    </section>
  );
}
