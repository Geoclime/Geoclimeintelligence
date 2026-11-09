import type { SatelliteFloodLayer } from "../../types/satellite-flood.types";
import { formatYearMonth } from "../../utils/rainfall-summary";
import { formatKm2 } from "../../utils/satellite-flood";

/**
 * What a satellite flood import contains, for the review screen: the month, how fine the mask is,
 * and how much of the LGAs was water, so an administrator can tell at a glance whether it looks
 * right before promoting it. A dry-season month showing more water than a flood month is the thing
 * to look out for: the radar can take smooth dry ground for water.
 */
export function SatelliteFloodRunCard({ layer }: { layer: SatelliteFloodLayer }) {
  return (
    <section className="card card__body" aria-label="The month" data-cy="satellite-flood-summary">
      <h2 className="card__title">{formatYearMonth(layer.yearMonth)}</h2>
      <p className="muted">
        {layer.title} · zoom {layer.zoom}, about {Math.round(layer.pixelMetres)} m a pixel · {layer.image.width.toLocaleString("en")} x{" "}
        {layer.image.height.toLocaleString("en")} pixels
      </p>
      <p>
        <strong>{formatKm2(layer.floodedKm2)} km²</strong> of the LGAs was water ({layer.percentFlooded}% of the {formatKm2(layer.coveredKm2)} km² the
        tiles cover). That includes rivers, creeks and other permanent water, not only floods.
      </p>
    </section>
  );
}
