import { useMemo } from "react";
import { Link } from "react-router";
import { usePublicArea } from "../../hooks/usePublicArea";
import type { PublicArea } from "../../types/public.types";
import { MAP_PATH } from "../../utils/map-url";
import { formatMm, formatYearMonth, monthName, percentAgainst, summariseRainfall, type MonthComparison } from "../../utils/rainfall-summary";
import { RainfallChart, type RainfallColumn } from "../rainfall/RainfallChart";
import { buttonClassName } from "../shared/Button";
import { ErrorState } from "../shared/ErrorState";
import { Icon } from "../shared/Icon";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import "../rainfall/rainfall.css";

interface PlaceSummaryProps {
  areaId: string;
  /** How the visitor got here, e.g. "Rumuche is in this LGA (Ward 4)". */
  note: string | null;
  signedIn: boolean;
}

/** "18% wetter than usual", "close to usual" (within 5%), or null without an average. */
function comparedWith(value: number | null, average: number | null): { text: string; tone: "wet" | "dry" | "usual" } | null {
  const pct = percentAgainst(value, average);
  if (pct === null) return null;
  if (Math.abs(pct) < 5) return { text: "Close to usual", tone: "usual" };
  return pct > 0 ? { text: `${pct}% wetter than usual`, tone: "wet" } : { text: `${Math.abs(pct)}% drier than usual`, tone: "dry" };
}

function columns(months: MonthComparison[]): RainfallColumn[] {
  return months.map((m, i) => ({
    key: m.yearMonth,
    label: monthName(m.yearMonth, "short"),
    sublabel: i === 0 || m.yearMonth.endsWith("-01") ? m.yearMonth.slice(0, 4) : undefined,
    valueMm: m.rainfallMm,
    averageMm: m.averageMm,
    title: formatYearMonth(m.yearMonth),
  }));
}

/** Where the area's own page is: an LGA's profile, a ward inside its LGA, or the directory. */
function profileLink({ area, parents }: PublicArea): string {
  if (area.level === 2) return `/places/${area.id}`;
  const lga = parents.find((p) => p.level === 2);
  if (area.level >= 3 && lga) return `/places/${lga.id}/wards/${area.id}`;
  return "/places";
}

function mapLink({ area, parents }: PublicArea): string {
  const lga = area.level === 2 ? area : parents.find((p) => p.level === 2);
  return lga ? `${MAP_PATH}?lga=${encodeURIComponent(lga.id)}` : MAP_PATH;
}

/**
 * What the place finder shows for one area: where it sits, how its rainfall compares with the
 * usual level, and links into the platform. It states plainly that rainfall alone is not a flood
 * forecast (docs/rainfall.md), so no figure here is read as one.
 */
export function PlaceSummary({ areaId, note, signedIn }: PlaceSummaryProps) {
  const { area: place, loading, error, refetch } = usePublicArea(areaId);
  const summary = useMemo(() => (place?.rainfall ? summariseRainfall(place.rainfall.months) : null), [place]);

  if (loading && !place) return <LoadingSpinner message="Looking up this area…" />;
  if (error && !place) return <ErrorState message={error} onRetry={refetch} />;
  if (!place) return null;

  const { area, parents, rainfall } = place;
  const within = parents.map((p) => `${p.unitName} ${p.levelName}`).join(", ");
  const borrowed = rainfall && rainfall.adminUnit.id !== area.id ? rainfall.adminUnit.unitName : null;
  const latest = summary?.latest ?? null;
  const latestVs = latest ? comparedWith(latest.rainfallMm, latest.averageMm) : null;
  const yearVs = summary ? comparedWith(summary.twelveMonthTotal, summary.averageYearTotal) : null;
  const sourceNames = rainfall?.sources.map((s) => s.provider).join(", ");

  return (
    <article className="place-summary" aria-labelledby="place-summary-title" data-cy="place-summary">
      <header className="place-summary__header">
        <p className="landing-eyebrow">{area.levelName}</p>
        <h3 id="place-summary-title" className="place-summary__title">
          {area.unitName}
        </h3>
        {within && <p className="place-summary__within">In {within}</p>}
        {note && <p className="place-summary__note">{note}</p>}
      </header>

      {!rainfall || !summary ? (
        <p className="place-summary__empty">
          {area.level === 1
            ? "Rainfall is recorded for each LGA. Choose an LGA, ward or community to see it."
            : `No rainfall is loaded for ${area.unitName} yet.`}
        </p>
      ) : (
        <>
          <dl className="place-summary__facts">
            {latest && latest.rainfallMm !== null && (
              <div className="place-summary__fact">
                <dt>{formatYearMonth(latest.yearMonth)}</dt>
                <dd className="place-summary__value">{formatMm(latest.rainfallMm)}</dd>
                {latestVs && <dd className={`place-summary__delta place-summary__delta--${latestVs.tone}`}>{latestVs.text} for {monthName(latest.yearMonth)}</dd>}
              </div>
            )}
            <div className="place-summary__fact">
              <dt>Last 12 months</dt>
              <dd className="place-summary__value">{summary.twelveMonthTotal === null ? "Some months missing" : formatMm(summary.twelveMonthTotal)}</dd>
              {yearVs && <dd className={`place-summary__delta place-summary__delta--${yearVs.tone}`}>{yearVs.text} for a year</dd>}
            </div>
          </dl>

          <RainfallChart
            columns={columns(summary.lastTwelve)}
            valueLabel="Monthly rainfall"
            averageLabel={summary.lastTwelve.some((m) => m.averageMm !== null) ? "Usual for the month" : null}
            ariaLabel={`Monthly rainfall over the last 12 months for ${rainfall.adminUnit.unitName}, each against its usual level.`}
          />

          <p className="place-summary__source">
            {borrowed ? `Rainfall is recorded per LGA, so this is ${borrowed}'s. ` : ""}
            Monthly mean over the area{sourceNames ? `, from ${sourceNames}` : ""}. Rainfall on its own does not tell you whether an area will flood.
          </p>
        </>
      )}

      <div className="place-summary__actions">
        <Link to={profileLink(place)} className={buttonClassName({ variant: "primary" })} data-cy="place-summary-profile">
          {signedIn ? "Open the full profile" : "Sign in for the full profile"}
          <Icon name="arrowRight" size={16} />
        </Link>
        <Link to={mapLink(place)} className={buttonClassName({ variant: "secondary" })}>
          <Icon name="map" size={16} />
          See it on the map
        </Link>
      </div>
    </article>
  );
}
