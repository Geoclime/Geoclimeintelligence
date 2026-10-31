import { Link } from "react-router";
import { useFloodHistory } from "../../hooks/useFloodHistory";
import { describeHistoryItem, floodOnMapLink, historyFigures } from "../../utils/flood-history";
import { formatDate } from "../../utils/formatDate";
import { formatArea } from "../../utils/survey-geometry";
import { Badge } from "../shared/Badge";
import { ErrorState } from "../shared/ErrorState";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import "./flood-history.css";

/**
 * An LGA's or ward's flood history: the floods responders recorded there by walking or drawing their edge, newest
 * first, each with its date, size, depth and whether the water has gone down, and a link to see it on the
 * main map. The same floods are drawn on the place's own map. `showWard` is off on a ward's page, where every flood is in that ward. Receded floods stay here as a record though they
 * leave the maps after a week. With none recorded
 * it says so, rather than showing anything made up.
 */
export function FloodHistoryCard({ areaId, areaName, showWard = true }: { areaId: string; areaName: string; showWard?: boolean }) {
  const { history, loading, error, refetch } = useFloodHistory(areaId);
  const figures = history ? historyFigures(history) : [];

  return (
    <section className="card card__body flood-history" aria-labelledby="flood-history-title" data-cy="flood-history">
      <h2 id="flood-history-title" className="card__title">
        Flood history
      </h2>
      <p className="card__subtitle">Floods responders have recorded in {areaName}.</p>

      {loading && !history ? (
        <LoadingSpinner message="Loading flood history…" />
      ) : error && !history ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : history && history.total === 0 ? (
        <p className="flood-history__none" data-cy="flood-history-empty">
          No floods have been recorded in {areaName} yet. When a responder walks or draws one on the map, it is kept here with its date, size and depth.
        </p>
      ) : (
        history && (
          <>
            <dl className="flood-history__figures" data-cy="flood-history-figures">
              {figures.map((figure) => (
                <div key={figure.label}>
                  <dt>{figure.label}</dt>
                  <dd>{figure.value}</dd>
                </div>
              ))}
            </dl>
            <ul className="flood-history__list" data-cy="flood-history-list">
              {history.items.map((item) => (
                <li key={item.id} className="flood-history__item" data-cy="flood-history-item">
                  <div>
                    <p className="flood-history__title">
                      {formatDate(item.observedAt)} · {formatArea(item.areaM2)} <Badge tone={item.receded ? "neutral" : "info"}>{item.receded ? "Receded" : "Active"}</Badge>
                    </p>
                    <p className="flood-history__meta">{describeHistoryItem(item, showWard)}</p>
                  </div>
                  <Link to={floodOnMapLink(item)} className="flood-history__link" data-cy="flood-history-map-link">
                    Show on map
                  </Link>
                </li>
              ))}
            </ul>
            <p className="flood-history__note">
              {history.total > history.items.length ? `Showing the latest ${history.items.length} of ${history.total.toLocaleString("en")}. ` : ""}On the map, a flood shows in
              magenta: click it for what it reaches. A receded flood stays here as a record, though it leaves the map after a week.
            </p>
          </>
        )
      )}
    </section>
  );
}
