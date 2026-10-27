import type { MapLayerInfo, OverlayLayerId } from "../../types/map-layer.types";
import { formatDate } from "../../utils/formatDate";
import { Icon } from "../shared/Icon";

interface MapLayerSourcesProps {
  catalog: MapLayerInfo[];
  /** Only the layers currently switched on are listed. */
  visible: OverlayLayerId[];
}

/**
 * Where each visible layer's data came from: provider, licence and when it was downloaded
 * (MVP "data-source transparency"). The provider line is also the attribution OpenStreetMap's
 * licence asks for. A layer with nothing loaded says so instead of looking sourced.
 */
export function MapLayerSources({ catalog, visible }: MapLayerSourcesProps) {
  const shown = catalog.filter((layer) => visible.includes(layer.id));
  if (shown.length === 0) return null;

  return (
    <section className="map-panel map-sources" aria-label="Data sources" data-cy="map-sources">
      <h2 className="map-panel__title">Data sources</h2>
      <ul className="map-sources__list">
        {shown.map((layer) => (
          <li key={layer.id} className="map-sources__item" data-cy={`map-source-${layer.id}`}>
            <span className="map-sources__layer">{layer.label}</span>
            {layer.sources.length === 0 ? (
              <span className="map-sources__meta">No data loaded yet</span>
            ) : (
              layer.sources.map((source) => (
                <span key={source.id} className="map-sources__source">
                  <a href={source.url} target="_blank" rel="noreferrer">
                    {source.provider}
                    <Icon name="externalLink" size={12} />
                  </a>
                  <span className="map-sources__meta">
                    {source.license} · downloaded {formatDate(source.downloadedOn)}
                  </span>
                </span>
              ))
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
