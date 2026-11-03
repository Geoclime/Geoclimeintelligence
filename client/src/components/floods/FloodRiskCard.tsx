import { useAreaFloodRisk } from "../../hooks/useAreaFloodRisk";
import "../map/flood-risk.css";

/**
 * How at risk an LGA or ward is, from the imported flood risk map: the share that is high or very high,
 * where it stands among the areas of its level, and how its area divides into the five classes. It
 * shows nothing until a map has been promoted and measured this area, rather than an empty card.
 *
 * It says "derived" in so many words: this is a modelled judgement of where it could flood, and sits
 * apart from the floods responders recorded on the ground (the flood history beside it).
 */
export function FloodRiskCard({ areaId, areaName }: { areaId: string; areaName: string }) {
  const { risk } = useAreaFloodRisk(areaId);
  if (!risk) return null;
  const level = risk.adminUnit.levelName;

  return (
    <section className="card card__body" aria-labelledby={`flood-risk-${areaId}`} data-cy="flood-risk-card">
      <h2 id={`flood-risk-${areaId}`} className="card__title">
        Flood risk
      </h2>
      <p data-cy="flood-risk-headline">
        <strong>{risk.percentHighOrVeryHigh}%</strong> of {areaName} is high or very high risk.
      </p>
      <p className="muted" data-cy="flood-risk-rank">
        {risk.rank.position === 1 ? `Most at risk of the ${risk.rank.of} ${level}s` : `${ordinal(risk.rank.position)} most at risk of ${risk.rank.of} ${level}s`}, by that share.
      </p>
      <div className="risk-bar" role="img" aria-label={`Share of ${areaName} in each flood risk class`}>
        {risk.classes.map((c) => (
          <span key={c.value} className="risk-bar__part" style={{ width: `${c.percent}%`, background: c.color }} />
        ))}
      </div>
      <ul className="risk-classes">
        {risk.classes.map((c) => (
          <li key={c.value} data-cy={`area-risk-class-${c.value}`}>
            <span className="risk-classes__swatch" style={{ background: c.color }} aria-hidden="true" />
            <span className="risk-classes__label">{c.label}</span>
            <span className="risk-classes__figures">
              {c.areaKm2.toLocaleString("en")} km² · {c.percent}%
            </span>
          </li>
        ))}
      </ul>
      <p className="muted section-gap">Derived: a modelled judgement of where it could flood, not a forecast and not a record of floods that happened.</p>
    </section>
  );
}

/** 2 -> "2nd", 11 -> "11th", 23 -> "23rd". */
export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}
