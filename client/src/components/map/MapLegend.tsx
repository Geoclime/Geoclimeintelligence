export interface LegendItem {
  key: string;
  label: string;
  /** CSS class suffix for the swatch: state | lga | ward | selected | passed | failed */
  swatch: string;
  /** A colour the swatch is painted with, for rows whose colours come from data rather than the stylesheet. */
  color?: string;
}

interface MapLegendProps {
  items: LegendItem[];
  /** A short provenance note, e.g. "Boundaries: geoBoundaries (CC BY 4.0), wards: GRID3". */
  note?: string;
  /**
   * Lets the legend fold away, so it doesn't cover the map once someone knows what the colours mean.
   * It starts open, and its rows stay in the page when folded.
   */
  collapsible?: boolean;
  /** For a collapsible legend: whether it starts open. A small map starts with it folded. */
  defaultOpen?: boolean;
}

function LegendList({ items, note }: MapLegendProps) {
  return (
    <>
      <ul className="map-legend__list">
        {items.map((item) => (
          <li key={item.key} className="map-legend__item">
            <span
              className={`map-legend__swatch map-legend__swatch--${item.swatch}`}
              style={item.color ? { background: item.color } : undefined}
              aria-hidden="true"
            />
            {item.label}
          </li>
        ))}
      </ul>
      {note && <p className="map-legend__note">{note}</p>}
    </>
  );
}

export function MapLegend({ items, note, collapsible = false, defaultOpen = true }: MapLegendProps) {
  if (collapsible) {
    return (
      <details className="map-panel map-legend" aria-label="Map legend" data-cy="map-legend" open={defaultOpen}>
        <summary className="map-panel__title map-legend__summary">Legend</summary>
        <LegendList items={items} note={note} />
      </details>
    );
  }
  return (
    <section className="map-panel map-legend" aria-label="Map legend" data-cy="map-legend">
      <h2 className="map-panel__title">Legend</h2>
      <LegendList items={items} note={note} />
    </section>
  );
}
