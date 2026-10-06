export interface LegendItem {
  key: string;
  label: string;
  /** CSS class suffix for the swatch: state | lga | ward | selected | passed | failed */
  swatch: string;
}

interface MapLegendProps {
  items: LegendItem[];
  /** A short provenance note, e.g. "Boundaries: geoBoundaries (CC BY 4.0), wards: GRID3". */
  note?: string;
}

export function MapLegend({ items, note }: MapLegendProps) {
  return (
    <section className="map-panel map-legend" aria-label="Map legend" data-cy="map-legend">
      <h2 className="map-panel__title">Legend</h2>
      <ul className="map-legend__list">
        {items.map((item) => (
          <li key={item.key} className="map-legend__item">
            <span className={`map-legend__swatch map-legend__swatch--${item.swatch}`} aria-hidden="true" />
            {item.label}
          </li>
        ))}
      </ul>
      {note && <p className="map-legend__note">{note}</p>}
    </section>
  );
}
