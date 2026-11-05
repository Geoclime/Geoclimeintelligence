import type { FloodRiskLayer } from "../../types/flood-risk.types";
import { classShare } from "../../utils/flood-risk";
import "../map/flood-risk.css";

/**
 * What a flood risk import contains, for the review screen: the map's name and grid, and how its
 * classified area divides into the five classes, so an administrator can see at a glance whether
 * it looks like the data team's map (for Rivers State, about 43% high or very high) before
 * promoting it.
 */
export function FloodRiskRunCard({ layer }: { layer: FloodRiskLayer }) {
  return (
    <section className="card card__body" aria-label="The flood risk map" data-cy="flood-risk-summary">
      <h2 className="card__title">The map</h2>
      <p className="muted">
        {layer.title} · {layer.cellSizeMetres} m cells · {layer.sourceCrs} · {layer.totalAreaKm2.toLocaleString("en")} km² classified
      </p>
      <div className="risk-bar" role="img" aria-label="Share of the classified area in each class">
        {layer.classes.map((risk) => (
          <span key={risk.value} className="risk-bar__part" style={{ width: `${classShare(risk, layer.totalAreaKm2)}%`, background: risk.color }} />
        ))}
      </div>
      <ul className="risk-classes">
        {layer.classes.map((risk) => (
          <li key={risk.value} data-cy={`risk-class-${risk.value}`}>
            <span className="risk-classes__swatch" style={{ background: risk.color }} aria-hidden="true" />
            <span className="risk-classes__label">{risk.label}</span>
            <span className="risk-classes__figures">
              {risk.areaKm2.toLocaleString("en")} km² · {classShare(risk, layer.totalAreaKm2)}%
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
