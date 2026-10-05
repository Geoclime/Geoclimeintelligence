import { Link, useParams } from "react-router";
import { AreaOutlineMap } from "../../components/map/AreaOutlineMap";
import { SourceBadge } from "../../components/map/SourceBadge";
import { Breadcrumbs } from "../../components/shared/Breadcrumbs/Breadcrumbs";
import { buttonClassName } from "../../components/shared/Button";
import { EmptyState } from "../../components/shared/EmptyState";
import { ErrorState } from "../../components/shared/ErrorState";
import { LoadingSpinner } from "../../components/shared/LoadingSpinner";
import { useAdminUnit } from "../../hooks/useAdminUnit";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useTheme } from "../../hooks/useTheme";
import { formatCoordinates } from "../../utils/formatCoordinates";

/** One ward on a small map, inside its parent LGA's outline, with its code and source. */
export function WardPage() {
  const { id, wardId } = useParams();
  const { resolved: theme } = useTheme();
  const { unit: ward, loading, error, notFound, refetch } = useAdminUnit(wardId);
  const { unit: lga } = useAdminUnit(id);
  useDocumentTitle(ward?.unitName ?? "Ward");

  if (loading && !ward) return <LoadingSpinner message="Loading the ward…" />;
  // A ward reached through the wrong LGA's address is treated as not found, not silently shown.
  if (notFound || (ward && ward.parentId !== id)) {
    return (
      <div className="page">
        <EmptyState
          icon="pin"
          title="We couldn't find that ward"
          message="It isn't in this LGA, or the link is incomplete."
          action={
            <Link to={id ? `/places/${id}` : "/places"} className={buttonClassName({ variant: "secondary" })}>
              Back
            </Link>
          }
        />
      </div>
    );
  }
  if (error || !ward) return <ErrorState message={error ?? "The ward couldn't be loaded."} onRetry={refetch} />;

  const lgaName = ward.parent?.unitName ?? lga?.unitName ?? "LGA";

  return (
    <div className="page" data-cy="ward-page">
      <Breadcrumbs
        items={[{ label: "Places", to: "/places" }, { label: lgaName, to: `/places/${id}` }, { label: ward.unitName }]}
      />
      <header className="page__header">
        <div>
          <p className="page__eyebrow">{ward.levelName}</p>
          <h1 className="page__title">{ward.unitName}</h1>
          <p className="page__lead">
            {ward.levelName} in <Link to={`/places/${id}`}>{lgaName}</Link>
          </p>
        </div>
      </header>

      <div className="split">
        <div className="stack">
          <section className="card card__body" aria-label="About this ward">
            <dl className="detail-list" data-cy="ward-details">
              <div>
                <dt>Code</dt>
                <dd>{ward.unitCode ?? <span className="muted">Not available</span>}</dd>
              </div>
              <div>
                <dt>LGA</dt>
                <dd>
                  <Link to={`/places/${id}`}>{lgaName}</Link>
                </dd>
              </div>
              <div>
                <dt>Centre</dt>
                <dd className="mono">{formatCoordinates(ward.centroid)}</dd>
              </div>
            </dl>
          </section>
          <section className="card card__body">
            <SourceBadge source={ward.source} variant="full" />
          </section>
        </div>
        <AreaOutlineMap
          label={`Map of ${ward.unitName} ward in ${lgaName}`}
          theme={theme}
          geometry={ward.geometry}
          bbox={lga?.bbox ?? ward.bbox}
          contextGeometry={lga?.geometry ?? null}
          dataCy="ward-map"
        />
      </div>
    </div>
  );
}
