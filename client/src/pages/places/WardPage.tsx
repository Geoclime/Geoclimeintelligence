import { Link, useParams } from "react-router";
import { DrainageCard } from "../../components/floods/DrainageCard";
import { FloodHistoryCard } from "../../components/floods/FloodHistoryCard";
import { FloodOutlookCard } from "../../components/floods/FloodOutlookCard";
import { FloodRiskCard } from "../../components/floods/FloodRiskCard";
import { SatelliteWaterCard } from "../../components/floods/SatelliteWaterCard";
import { AreaOutlineMap } from "../../components/map/AreaOutlineMap";
import { AreaSurveyPopup } from "../../components/map/AreaSurveyPopup";
import { SourceBadge } from "../../components/map/SourceBadge";
import { Breadcrumbs } from "../../components/shared/Breadcrumbs/Breadcrumbs";
import { buttonClassName } from "../../components/shared/Button";
import { EmptyState } from "../../components/shared/EmptyState";
import { ErrorState } from "../../components/shared/ErrorState";
import { LoadingSpinner } from "../../components/shared/LoadingSpinner";
import { Tabs, type TabItem } from "../../components/shared/Tabs";
import { useAdminUnit } from "../../hooks/useAdminUnit";
import { useAreaSurvey } from "../../hooks/useAreaSurvey";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useTabParam } from "../../hooks/useTabParam";
import { useTheme } from "../../hooks/useTheme";
import { formatCoordinates } from "../../utils/formatCoordinates";

/** The tabs of a ward page, in order. The open one lives in the URL (?tab=forecast). */
const WARD_TAB_IDS = ["overview", "risk", "forecast", "satellite"] as const;

/**
 * One ward, in tabs: an overview (its code and source, on a small map inside its parent LGA's outline,
 * where the floods responders recorded in it are drawn and a click opens one), flood risk and history
 * and drainage, the flood forecast, and satellite water. A tab loads its data the first time it is opened.
 */
export function WardPage() {
  const { id, wardId } = useParams();
  const [activeTab, selectTab] = useTabParam(WARD_TAB_IDS);
  const { resolved: theme } = useTheme();
  const { unit: ward, loading, error, notFound, refetch } = useAdminUnit(wardId);
  const { unit: lga } = useAdminUnit(id);
  const area = useAreaSurvey(ward?.id, ward?.bbox ?? null);
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

  const tabs: TabItem[] = [
    {
      id: "overview",
      label: "Overview",
      dataCy: "ward-tab-overview",
      content: (
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
            areaId={ward.id}
            bbox={lga?.bbox ?? ward.bbox}
            contextGeometry={lga?.geometry ?? null}
            countryCode={ward.countryCode}
            floods={area.floods}
            drains={area.drains}
            onSelect={area.select}
            dataCy="ward-map"
          >
            <AreaSurveyPopup selected={area.selected} onClose={area.close} />
          </AreaOutlineMap>
        </div>
      ),
    },
    {
      id: "risk",
      label: "Flood risk",
      dataCy: "ward-tab-risk",
      content: (
        <div className="stack">
          <FloodRiskCard areaId={ward.id} areaName={ward.unitName} />
          <FloodHistoryCard areaId={ward.id} areaName={ward.unitName} showWard={false} />
          <DrainageCard areaId={ward.id} areaName={ward.unitName} showWard={false} />
        </div>
      ),
    },
    {
      id: "forecast",
      label: "Forecast",
      dataCy: "ward-tab-forecast",
      content: <FloodOutlookCard areaId={ward.id} areaName={ward.unitName} />,
    },
    {
      id: "satellite",
      label: "Satellite water",
      dataCy: "ward-tab-satellite",
      content: <SatelliteWaterCard areaId={ward.id} areaName={ward.unitName} countryCode={ward.countryCode} lgaId={id ?? null} />,
    },
  ];

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

      <Tabs tabs={tabs} activeId={activeTab} onChange={selectTab} ariaLabel={`${ward.unitName} sections`} lazy />
    </div>
  );
}
