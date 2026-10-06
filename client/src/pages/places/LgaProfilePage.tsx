import { Link, useParams } from "react-router";
import { AreaOutlineMap } from "../../components/map/AreaOutlineMap";
import { SourceBadge } from "../../components/map/SourceBadge";
import { Breadcrumbs } from "../../components/shared/Breadcrumbs/Breadcrumbs";
import { buttonClassName } from "../../components/shared/Button";
import { EmptyState } from "../../components/shared/EmptyState";
import { ErrorState } from "../../components/shared/ErrorState";
import { LoadingSpinner } from "../../components/shared/LoadingSpinner";
import { useAdminUnit } from "../../hooks/useAdminUnit";
import { useAdminUnitChildren } from "../../hooks/useAdminUnitChildren";
import { useAdminUnitLayer } from "../../hooks/useAdminUnitLayer";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useTheme } from "../../hooks/useTheme";
import { formatCoordinates } from "../../utils/formatCoordinates";

/**
 * One LGA: outlined on a small map with its wards, its code, parent and source, and its wards as
 * a clickable list. Later phases add rainfall and flood history here.
 */
export function LgaProfilePage() {
  const { id } = useParams();
  const { resolved: theme } = useTheme();
  const { unit, loading, error, notFound, refetch } = useAdminUnit(id);
  const { children: wards, loading: wardsLoading, error: wardsError } = useAdminUnitChildren(unit?.id);
  const wardShapes = useAdminUnitLayer(unit?.bbox ?? null, 3, { enabled: Boolean(unit), parentId: unit?.id, zoom: 11 });
  useDocumentTitle(unit?.unitName ?? "Place");

  if (loading && !unit) return <LoadingSpinner message="Loading the LGA…" />;
  if (notFound) {
    return (
      <div className="page">
        <EmptyState
          icon="pin"
          title="We couldn't find that place"
          message="It may have been removed, or the link is incomplete."
          action={
            <Link to="/places" className={buttonClassName({ variant: "secondary" })}>
              Back to places
            </Link>
          }
        />
      </div>
    );
  }
  if (error || !unit) return <ErrorState message={error ?? "The area couldn't be loaded."} onRetry={refetch} />;

  return (
    <div className="page" data-cy="lga-profile-page">
      <Breadcrumbs items={[{ label: "Places", to: "/places" }, { label: unit.unitName }]} />
      <header className="page__header">
        <div>
          <p className="page__eyebrow">{unit.levelName}</p>
          <h1 className="page__title">{unit.unitName}</h1>
          <p className="page__lead">
            {unit.parent ? `${unit.levelName} in ${unit.parent.unitName} ${unit.parent.levelName}` : unit.levelName}
          </p>
        </div>
        <Link to={`/?lga=${unit.id}`} className={buttonClassName({ variant: "secondary" })} data-cy="show-on-map">
          Show on the main map
        </Link>
      </header>

      <div className="split">
        <div className="stack">
          <section className="card card__body" aria-label="About this area">
            <dl className="detail-list" data-cy="lga-details">
              <div>
                <dt>Code</dt>
                <dd>{unit.unitCode ?? <span className="muted">Not available</span>}</dd>
              </div>
              <div>
                <dt>Wards</dt>
                <dd>{unit.childCount > 0 ? unit.childCount : <span className="muted">Not loaded yet</span>}</dd>
              </div>
              <div>
                <dt>Centre</dt>
                <dd className="mono">{formatCoordinates(unit.centroid)}</dd>
              </div>
            </dl>
          </section>
          <section className="card card__body">
            <SourceBadge source={unit.source} variant="full" />
          </section>
          <section className="card card__body">
            <EmptyState
              icon="layers"
              title="Rainfall and flood history"
              message="These appear here once the rainfall and disaster-event datasets are connected. Nothing is shown until real data exists."
            />
          </section>
        </div>

        <AreaOutlineMap
          label={`Map of ${unit.unitName} and its wards`}
          theme={theme}
          geometry={unit.geometry}
          bbox={unit.bbox}
          innerAreas={wardShapes.data}
          dataCy="lga-map"
        />
      </div>

      <section className="card section-gap" aria-labelledby="wards-title">
        <div className="card__header">
          <div>
            <h2 id="wards-title" className="card__title">
              Wards
            </h2>
            <p className="card__subtitle">The wards inside {unit.unitName}.</p>
          </div>
        </div>
        {wardsLoading && wards.length === 0 ? (
          <LoadingSpinner message="Loading wards…" />
        ) : wardsError ? (
          <ErrorState message={wardsError} />
        ) : wards.length === 0 ? (
          <EmptyState icon="pin" message="No wards are loaded for this LGA yet." />
        ) : (
          <ul className="ward-grid" data-cy="ward-list">
            {wards.map((ward) => (
              <li key={ward.id}>
                <Link to={`/places/${unit.id}/wards/${ward.id}`} className="ward-grid__link" data-cy="ward-link">
                  <span className="ward-grid__name">{ward.unitName}</span>
                  {ward.unitCode && <span className="ward-grid__code">{ward.unitCode}</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
