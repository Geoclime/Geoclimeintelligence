import type { BoundaryLayerId } from "./map-style";

export interface LayerOption {
  id: BoundaryLayerId;
  label: string;
  checked: boolean;
  /** Shown under the label, e.g. "Zoom in to see wards". */
  hint?: string;
  loading?: boolean;
}

interface LayerToggleProps {
  layers: LayerOption[];
  onChange: (id: BoundaryLayerId, checked: boolean) => void;
}

/**
 * The layer switcher. It lists only layers that are actually wired to real data (standard
 * section 10): State, LGA and Ward in Phase 2. Rainfall, flood risk and the rest join once their
 * datasets and endpoints exist, never as placeholder checkboxes.
 */
export function LayerToggle({ layers, onChange }: LayerToggleProps) {
  return (
    <fieldset className="map-panel layer-toggle" data-cy="layer-toggle">
      <legend className="map-panel__title">Layers</legend>
      {layers.map((layer) => (
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
    </fieldset>
  );
}
