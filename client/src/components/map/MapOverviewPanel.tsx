import { Link } from "react-router";
import type { AdminUnitSummary } from "../../types/admin-unit.types";
import type { Country } from "../../types/country.types";
import { FloodAheadControl } from "../floods/FloodAheadControl";
import { Button, buttonClassName } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { areaTitle as formatAreaTitle } from "../../utils/area-title";

/** What the "Follow me" button needs: see hooks/useFollowMe.ts. */
interface FollowMeControl {
  supported: boolean;
  following: boolean;
  centring: boolean;
  /** On, but no position has arrived yet. */
  waiting: boolean;
  error: string | null;
  onToggle: () => void;
  onRecentre: () => void;
}

interface MapOverviewPanelProps {
  country: Country | null;
  stateUnit: AdminUnitSummary | null;
  selectedLga: AdminUnitSummary | null;
  onClearLga: () => void;
  onWhereAmI: () => void;
  locating: boolean;
  geoError: string | null;
  follow: FollowMeControl;
}

/** "Rivers" at level "State" reads as "Rivers State". */
function areaTitle(unit: AdminUnitSummary): string {
  return formatAreaTitle(unit.unitName, unit.levelName);
}

/**
 * The floating card on the home map: which place this is, how many areas it has, the "Where am I?"
 * button, and the selected LGA with a link to its profile. Counts come from the server; a level
 * with no areas yet says so instead of showing 0 as if it were a measurement.
 */
export function MapOverviewPanel({
  country,
  stateUnit,
  selectedLga,
  onClearLga,
  onWhereAmI,
  locating,
  geoError,
  follow,
}: MapOverviewPanelProps) {
  const counts = country?.levels.filter((level) => level.level > 1) ?? [];

  return (
    <section className="map-panel map-overview" aria-labelledby="map-overview-title" data-cy="map-overview">
      <p className="map-panel__title">{country?.countryName ?? "Map"}</p>
      <h1 id="map-overview-title" className="map-overview__title">
        {stateUnit ? areaTitle(stateUnit) : "Boundaries"}
      </h1>
      {counts.length > 0 && (
        <p className="map-overview__counts" data-cy="map-counts">
          {counts
            .map((level) => (level.unitCount > 0 ? `${level.unitCount.toLocaleString()} ${level.name}s` : `${level.name}s: not loaded`))
            .join(" · ")}
        </p>
      )}

      <div className="map-overview__locate-row">
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="crosshair" size={16} />}
          loading={locating}
          loadingLabel="Finding you…"
          onClick={onWhereAmI}
          data-cy="where-am-i"
        >
          Where am I?
        </Button>
        {follow.supported && (
          <Button
            variant={follow.following ? "primary" : "secondary"}
            size="sm"
            icon={<Icon name="pin" size={16} />}
            aria-pressed={follow.following}
            onClick={follow.onToggle}
            data-cy="follow-me"
          >
            {follow.following ? "Following you: stop" : "Follow me"}
          </Button>
        )}
        {follow.following && !follow.centring && (
          <Button variant="ghost" size="sm" onClick={follow.onRecentre} data-cy="follow-recentre">
            Re-centre
          </Button>
        )}
      </div>
      {follow.waiting && (
        <p className="map-overview__status" role="status" data-cy="follow-waiting">
          Waiting for your location…
        </p>
      )}
      {(geoError || follow.error) && (
        <p className="map-overview__error" role="alert" data-cy="geo-error">
          {geoError ?? follow.error}
        </p>
      )}
      <FloodAheadControl />
      <p className="map-overview__hint">Tap or click anywhere on the map to see the state, LGA and ward there.</p>

      {selectedLga && (
        <div className="map-overview__selected" data-cy="selected-lga">
          <div>
            <p className="map-overview__selected-label">Selected LGA</p>
            <p className="map-overview__selected-name">{selectedLga.unitName}</p>
            <p className="map-overview__selected-meta">
              {selectedLga.childCount > 0 ? `${selectedLga.childCount} wards` : "Wards: not loaded"}
              {selectedLga.unitCode ? ` · ${selectedLga.unitCode}` : ""}
            </p>
          </div>
          <div className="map-overview__selected-actions">
            <Link to={`/places/${selectedLga.id}`} className={buttonClassName({ size: "sm" })} data-cy="open-lga-profile">
              Profile
            </Link>
            <button type="button" className="map-overview__clear" onClick={onClearLga} aria-label="Clear selected LGA">
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
