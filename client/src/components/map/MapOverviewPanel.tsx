import { Link } from "react-router";
import type { AdminUnitSummary } from "../../types/admin-unit.types";
import type { Country } from "../../types/country.types";
import { Button, buttonClassName } from "../shared/Button";
import { Icon } from "../shared/Icon";

interface MapOverviewPanelProps {
  country: Country | null;
  stateUnit: AdminUnitSummary | null;
  selectedLga: AdminUnitSummary | null;
  onClearLga: () => void;
  onWhereAmI: () => void;
  locating: boolean;
  geoError: string | null;
}

/** "Rivers" at level "State" reads as "Rivers State"; a name that already ends in it is left alone. */
function areaTitle(unit: AdminUnitSummary): string {
  return unit.unitName.toLowerCase().endsWith(unit.levelName.toLowerCase()) ? unit.unitName : `${unit.unitName} ${unit.levelName}`;
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

      <Button
        variant="secondary"
        size="sm"
        icon={<Icon name="crosshair" size={16} />}
        loading={locating}
        loadingLabel="Finding you…"
        onClick={onWhereAmI}
        className="map-overview__locate"
        data-cy="where-am-i"
      >
        Where am I?
      </Button>
      {geoError && (
        <p className="map-overview__error" role="alert" data-cy="geo-error">
          {geoError}
        </p>
      )}
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
