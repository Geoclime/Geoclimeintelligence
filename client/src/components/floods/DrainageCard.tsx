import { Link } from "react-router";
import { useDrainageSummary } from "../../hooks/useDrainageSummary";
import { CONDITION_BADGE_TONE, CONDITION_INFO, drainTitle } from "../../utils/field-survey";
import { describeDrainItem, drainOnMapLink, drainageFigures } from "../../utils/drainage-summary";
import { formatDate } from "../../utils/formatDate";
import { Badge } from "../shared/Badge";
import { ErrorState } from "../shared/ErrorState";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import "./place-survey.css";

/**
 * An LGA's or ward's drainage: the drains, culverts, outfalls and ponds responders recorded there, with how
 * many aren't carrying water, and the list with the ones needing attention first, each with its condition,
 * when it was last looked at and a link to see it on the main map. The same drains are drawn on the place's
 * own map. `showWard` is off on a ward's page, where every drain is in that ward. With none recorded it
 * says so, rather than showing anything made up.
 */
export function DrainageCard({ areaId, areaName, showWard = true }: { areaId: string; areaName: string; showWard?: boolean }) {
  const { summary, loading, error, refetch } = useDrainageSummary(areaId);
  const figures = summary ? drainageFigures(summary) : [];

  return (
    <section className="card card__body place-survey" aria-labelledby="drainage-title" data-cy="drainage-card">
      <h2 id="drainage-title" className="card__title">
        Drainage
      </h2>
      <p className="card__subtitle">Drains and culverts responders have recorded in {areaName}, the ones needing attention first.</p>

      {loading && !summary ? (
        <LoadingSpinner message="Loading drainage…" />
      ) : error && !summary ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : summary && summary.total === 0 ? (
        <p className="place-survey__none" data-cy="drainage-empty">
          No drainage has been recorded in {areaName} yet. When a responder walks a drain or marks a culvert on the map, it is kept here with its condition.
        </p>
      ) : (
        summary && (
          <>
            <dl className="place-survey__figures" data-cy="drainage-figures">
              {figures.map((figure) => (
                <div key={figure.label} className={figure.alert ? "place-survey__figure--alert" : undefined}>
                  <dt>{figure.label}</dt>
                  <dd>{figure.value}</dd>
                </div>
              ))}
            </dl>
            <ul className="place-survey__list" data-cy="drainage-list">
              {summary.items.map((item) => (
                <li key={item.id} className="place-survey__item" data-cy="drainage-item">
                  <div>
                    <p className="place-survey__title">
                      {drainTitle(item)} <Badge tone={CONDITION_BADGE_TONE[CONDITION_INFO[item.condition].tone]}>{CONDITION_INFO[item.condition].label}</Badge>
                    </p>
                    <p className="place-survey__meta">{describeDrainItem(item, showWard)}</p>
                  </div>
                  <Link to={drainOnMapLink(item)} className="place-survey__link" data-cy="drainage-map-link">
                    Show on map
                  </Link>
                </li>
              ))}
            </ul>
            <p className="place-survey__note">
              {summary.total > summary.items.length ? `Showing ${summary.items.length} of ${summary.total.toLocaleString("en")}. ` : ""}Last checked {formatDate(summary.lastCheckedAt)}. On the
              map, a drain is green when clear, amber when partly blocked and red when blocked, overflowing or damaged: click one for its details.
            </p>
          </>
        )
      )}
    </section>
  );
}
