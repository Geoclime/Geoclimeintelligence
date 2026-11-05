import type { PublicLayerId, PublicOverview } from "../../types/public.types";
import { Button } from "../shared/Button";
import { Icon, type IconName } from "../shared/Icon";

interface Stat {
  key: string;
  icon: IconName;
  value: number;
  label: string;
  detail: string;
}

const LAYER_STATS: Record<PublicLayerId, { icon: IconName; label: string; detail: string }> = {
  settlements: { icon: "users", label: "Communities", detail: "Named settlements you can search by name" },
  infrastructure: { icon: "shield", label: "Facilities", detail: "Health, schools, police, markets and more" },
  buildings: { icon: "layers", label: "Buildings", detail: "Building outlines, shown at street level" },
  roads: { icon: "map", label: "Road sections", detail: "From main highways to local streets" },
  waterways: { icon: "globe", label: "River and creek sections", detail: "Rivers, creeks and water bodies" },
};

const LAYER_ORDER: PublicLayerId[] = ["settlements", "infrastructure", "buildings", "roads", "waterways"];

/** Months from "YYYY-MM" to "YYYY-MM", both included. */
function monthSpan(first: string, last: string): number {
  const index = (ym: string) => Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7));
  return index(last) - index(first) + 1;
}

function statsOf(overview: PublicOverview): Stat[] {
  const areas = overview.areas
    .filter((a) => a.level >= 2)
    .map((a) => ({
      key: `level-${a.level}`,
      icon: "pin" as IconName,
      value: a.count,
      label: `${a.levelName}s`,
      detail: a.level === 2 ? "Each with a boundary and its own profile" : `Inside the ${overview.areas.find((p) => p.level === a.level - 1)?.levelName ?? "areas above"}s`,
    }));
  const layers = LAYER_ORDER.flatMap((id) => {
    const layer = overview.layers.find((l) => l.id === id);
    return layer && layer.featureCount > 0 ? [{ key: id, value: layer.featureCount, ...LAYER_STATS[id] }] : [];
  });
  const rainfall = overview.rainfall
    ? [{ key: "rainfall", icon: "cloudRain" as IconName, value: monthSpan(overview.rainfall.firstMonth, overview.rainfall.lastMonth), label: "Months of rainfall", detail: `For ${overview.rainfall.areaCount} areas, month by month` }]
    : [];
  return [...areas, ...rainfall, ...layers];
}

interface CoverageStatsProps {
  overview: PublicOverview | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

/** The live counters: what the platform holds right now, read from the database (cached for minutes). */
export function CoverageStats({ overview, loading, error, onRetry }: CoverageStatsProps) {
  if (!overview) {
    if (error) {
      return (
        <div className="coverage__problem" role="alert">
          <p>The live figures couldn't be loaded. {error}</p>
          <Button variant="secondary" size="sm" onClick={onRetry} icon={<Icon name="refresh" size={14} />}>
            Try again
          </Button>
        </div>
      );
    }
    return (
      <ul className="coverage__grid" aria-busy={loading} aria-label="Loading the live figures">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="coverage__stat coverage__stat--placeholder" aria-hidden="true" />
        ))}
      </ul>
    );
  }

  return (
    <ul className="coverage__grid" data-cy="coverage-stats">
      {statsOf(overview).map((stat) => (
        <li key={stat.key} className="coverage__stat">
          <span className="coverage__icon">
            <Icon name={stat.icon} size={18} />
          </span>
          <span className="coverage__value">{stat.value.toLocaleString("en")}</span>
          <span className="coverage__label">{stat.label}</span>
          <span className="coverage__detail">{stat.detail}</span>
        </li>
      ))}
    </ul>
  );
}
