import { Link, useParams } from "react-router";
import { DrainageCard } from "../../components/floods/DrainageCard";
import { FloodHistoryCard } from "../../components/floods/FloodHistoryCard";
import { FloodOutlookCard } from "../../components/floods/FloodOutlookCard";
import { FloodRiskCard } from "../../components/floods/FloodRiskCard";
import { SatelliteWaterCard } from "../../components/floods/SatelliteWaterCard";
import { AreaOutlineMap } from "../../components/map/AreaOutlineMap";
import { AreaSurveyPopup } from "../../components/map/AreaSurveyPopup";
import { SourceBadge } from "../../components/map/SourceBadge";
import { RainfallCard } from "../../components/rainfall/RainfallCard";
import { Breadcrumbs } from "../../components/shared/Breadcrumbs/Breadcrumbs";
import { buttonClassName } from "../../components/shared/Button";
import { EmptyState } from "../../components/shared/EmptyState";
import { ErrorState } from "../../components/shared/ErrorState";
import { LoadingSpinner } from "../../components/shared/LoadingSpinner";
import { Tabs, type TabItem } from "../../components/shared/Tabs";
import { useAdminUnit } from "../../hooks/useAdminUnit";
import { useAdminUnitChildren } from "../../hooks/useAdminUnitChildren";
import { useAdminUnitLayer } from "../../hooks/useAdminUnitLayer";
import { useAreaSurvey } from "../../hooks/useAreaSurvey";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useTabParam } from "../../hooks/useTabParam";
import { useTheme } from "../../hooks/useTheme";
import { formatCoordinates } from "../../utils/formatCoordinates";
import { MAP_PATH } from "../../utils/map-url";

/** The tabs of an LGA page, in order. The open one lives in the URL (?tab=forecast). */
const LGA_TAB_IDS = ["overview", "risk", "forecast", "rainfall", "satellite", "wards"] as const;

/**
 * One LGA, in tabs: an overview (its code, parent and source, outlined on a small map with its wards,
 * where the floods responders recorded there are drawn and a click opens one), flood risk and history
 * and drainage, the flood forecast, monthly rainfall, satellite water, and its wards as a clickable list.
 * A tab loads its data the first time it is opened.
 */
export function LgaProfilePage() {
  const { id } = useParams();
  const [activeTab, selectTab] = useTabParam(LGA_TAB_IDS);
  const { resolved: theme } = useTheme();
  const { unit, loading, error, notFound, refetch } = useAdminUnit(id);
  const { children: wards, loading: wardsLoading, error: wardsError } = useAdminUnitChildren(unit?.id);
  const wardShapes = useAdminUnitLayer(unit?.bbox ?? null, 3, { enabled: Boolean(unit), parentId: unit?.id, zoom: 11 });
  const area = useAreaSurvey(unit?.id, unit?.bbox ?? null);
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

  const tabs: TabItem[] = [
    {
      id: "overview",
      label: "Overview",
      dataCy: "lga-tab-overview",
      content: (
        <div className="split split--map-first">
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
          </div>

          <AreaOutlineMap
            label={`Map of ${unit.unitName} and its wards`}
            theme={theme}
            geometry={unit.geometry}
            areaId={unit.id}
            bbox={unit.bbox}
            innerAreas={wardShapes.data}
            countryCode={unit.countryCode}
            floods={area.floods}
            drains={area.drains}
            onSelect={area.select}
            popupOpen={Boolean(area.selected)}
            dataCy="lga-map"
          >
            <AreaSurveyPopup selected={area.selected} onClose={area.close} />
          </AreaOutlineMap>
        </div>
      ),
    },
    {
      id: "risk",
      label: "Flood risk",
      dataCy: "lga-tab-risk",
      content: (
        <div className="stack">
          <FloodRiskCard areaId={unit.id} areaName={unit.unitName} />
          <FloodHistoryCard areaId={unit.id} areaName={unit.unitName} />
          <DrainageCard areaId={unit.id} areaName={unit.unitName} />
        </div>
      ),
    },
    {
      id: "forecast",
      label: "Forecast",
      dataCy: "lga-tab-forecast",
      content: <FloodOutlookCard areaId={unit.id} areaName={unit.unitName} />,
    },
    {
      id: "rainfall",
      label: "Rainfall",
      dataCy: "lga-tab-rainfall",
      content: <RainfallCard adminUnitId={unit.id} areaName={unit.unitName} />,
    },
    {
      id: "satellite",
      label: "Satellite water",
      dataCy: "lga-tab-satellite",
      content: <SatelliteWaterCard areaId={unit.id} areaName={unit.unitName} countryCode={unit.countryCode} lgaId={unit.id} />,
    },
    {
      id: "wards",
      label: unit.childCount > 0 ? `Wards (${unit.childCount})` : "Wards",
      dataCy: "lga-tab-wards",
      content: (
        <section className="card" aria-labelledby="wards-title">
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
      ),
    },
  ];

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
        <Link to={`${MAP_PATH}?lga=${unit.id}`} className={buttonClassName({ variant: "secondary" })} data-cy="show-on-map">
          Show on the main map
        </Link>
      </header>

      <Tabs tabs={tabs} activeId={activeTab} onChange={selectTab} ariaLabel={`${unit.unitName} sections`} lazy />
    </div>
  );
}
