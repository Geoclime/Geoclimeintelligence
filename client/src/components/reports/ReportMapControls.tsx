import type { MapLayerId } from "../map/map-style";
import { LAYER_SWITCHES } from "./report-map-layers";
import "./reports.css";

interface LayerSwitchesProps {
  layers: Record<MapLayerId, boolean>;
  onToggle: (ids: MapLayerId[], checked: boolean) => void;
  loading: boolean;
  failed: boolean;
  /** Prefix for the `data-cy` hooks: `${dataCyPrefix}-layers`. */
  dataCyPrefix: string;
}

/** The checkboxes under a report map. They double as the legend: each carries the swatch the main map's legend uses. */
export function LayerSwitches({ layers, onToggle, loading, failed, dataCyPrefix }: LayerSwitchesProps) {
  return (
    <div className="report-map__layers" role="group" aria-label="What to show on the map" data-cy={`${dataCyPrefix}-layers`}>
      {LAYER_SWITCHES.map(({ label, swatch, layers: ids }) => (
        <label key={label} className="report-map__layer">
          <input type="checkbox" checked={ids.every((id) => layers[id])} onChange={(event) => onToggle(ids, event.target.checked)} />
          <span className={`map-legend__swatch map-legend__swatch--${swatch}`} aria-hidden="true" />
          {label}
        </label>
      ))}
      <span className="report-map__status" role="status">
        {failed ? "Some layers couldn't load." : loading ? "Loading layers…" : ""}
      </span>
    </div>
  );
}

interface MapTypeToggleProps {
  satellite: boolean;
  onChoose: (satellite: boolean) => void;
  /** Prefix for the `data-cy` hooks: `${dataCyPrefix}-streets` and `${dataCyPrefix}-satellite`. */
  dataCyPrefix: string;
}

/** Street map or aerial imagery. */
export function MapTypeToggle({ satellite, onChoose, dataCyPrefix }: MapTypeToggleProps) {
  return (
    <div className="segmented" role="group" aria-label="Map type">
      <button type="button" aria-pressed={!satellite} onClick={() => onChoose(false)} data-cy={`${dataCyPrefix}-streets`}>
        Map
      </button>
      <button type="button" aria-pressed={satellite} onClick={() => onChoose(true)} data-cy={`${dataCyPrefix}-satellite`}>
        Satellite
      </button>
    </div>
  );
}
