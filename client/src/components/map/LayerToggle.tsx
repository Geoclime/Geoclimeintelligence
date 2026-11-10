import type { MapBase } from "../../utils/map-url";
import type { MapLayerId } from "./map-style";

export interface LayerOption {
  id: MapLayerId;
  label: string;
  checked: boolean;
  /** Shown under the label, e.g. "Zoom in to see wards". */
  hint?: string;
  loading?: boolean;
  /** The heading it is listed under ("Boundaries", "Water"...). Layers are grouped in the order their groups first appear. */
  group?: string;
}

interface LayerToggleProps {
  layers: LayerOption[];
  onChange: (id: MapLayerId, checked: boolean) => void;
  /** With these, a Map / Satellite switch heads the list. */
  base?: MapBase;
  onBaseChange?: (base: MapBase) => void;
  /** With these, a line under the heading says how many layers are on, with "Hide all" (or "Restore" when none are). */
  onHideAll?: () => void;
  onRestore?: () => void;
}

/**
 * The layer switcher. It lists only layers that are actually wired to real data (standard
 * section 10), grouped under short headings so a long list stays scannable: boundaries, the
 * places and services on the ground, water, what responders recorded, and the flood risk surface.
 * Rainfall and the rest join once their datasets and endpoints exist, never as placeholder checkboxes.
 */
export function LayerToggle({ layers, onChange, base, onBaseChange, onHideAll, onRestore }: LayerToggleProps) {
  const on = layers.filter((layer) => layer.checked).length;
  const groups: { name: string; layers: LayerOption[] }[] = [];
  for (const layer of layers) {
    const name = layer.group ?? "";
    const group = groups.find((g) => g.name === name);
    if (group) group.layers.push(layer);
    else groups.push({ name, layers: [layer] });
  }

  return (
    <fieldset className="map-panel layer-toggle" data-cy="layer-toggle">
      <legend className="map-panel__title">Layers</legend>
      {base && onBaseChange && (
        <div className="segmented layer-toggle__base" role="group" aria-label="Base map">
          <button type="button" aria-pressed={base === "map"} onClick={() => onBaseChange("map")} data-cy="base-map">
            Map
          </button>
          <button type="button" aria-pressed={base === "satellite"} onClick={() => onBaseChange("satellite")} data-cy="base-satellite">
            Satellite
          </button>
        </div>
      )}
      {onHideAll && onRestore && (
        <div className="layer-toggle__bulk" data-cy="layer-bulk">
          <span className="layer-toggle__count" aria-live="polite">
            {on === 0 ? "All layers off" : on === 1 ? "1 layer on" : `${on} layers on`}
          </span>
          {on > 0 ? (
            <button type="button" className="layer-toggle__bulk-button" onClick={onHideAll} data-cy="layers-hide-all">
              Hide all
            </button>
          ) : (
            <button type="button" className="layer-toggle__bulk-button" onClick={onRestore} data-cy="layers-restore">
              Restore
            </button>
          )}
        </div>
      )}
      {groups.map((group) => (
        <div key={group.name || "layers"} className="layer-toggle__group">
          {group.name && <p className="layer-toggle__group-title">{group.name}</p>}
          {group.layers.map((layer) => (
            <label key={layer.id} className="layer-toggle__option" data-cy={`layer-${layer.id}`}>
              <input type="checkbox" checked={layer.checked} onChange={(event) => onChange(layer.id, event.target.checked)} />
              <span className={`layer-toggle__swatch layer-toggle__swatch--${layer.id}`} aria-hidden="true" />
              <span className="layer-toggle__text">
                <span>{layer.label}</span>
                {layer.hint && <span className="layer-toggle__hint">{layer.hint}</span>}
              </span>
              {layer.loading && <span className="layer-toggle__busy" aria-label="Loading" />}
            </label>
          ))}
        </div>
      ))}
    </fieldset>
  );
}
