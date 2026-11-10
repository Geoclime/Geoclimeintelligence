import { Link } from "react-router";
import { usePublicFloodOutlook } from "../../hooks/useFloodPrediction";
import { ALERT_SEVERITIES } from "../../types/alert.types";
import { PREDICTION_RISK_INFO } from "../../types/flood-prediction.types";
import type { PublicAlertMap, PublicOutline } from "../../types/public.types";
import { SEVERITY_INFO, severityByLga, severityByWardLga, sortAlerts } from "../../utils/alert-severity";
import { formatDateTime } from "../../utils/formatDate";
import { AlertCard } from "../alerts/AlertCard";
import { AlertMap } from "../alerts/AlertMap";
import { SeverityBadge } from "../alerts/SeverityBadge";
import { Badge } from "../shared/Badge";
import { buttonClassName } from "../shared/Button";
import { Icon } from "../shared/Icon";

interface AlertsSectionProps {
  alertMap: PublicAlertMap | null;
  error: string | null;
  outline: PublicOutline | null;
  outlineLoading: boolean;
  signedIn: boolean;
}

/**
 * The landing page's national alert map: LGAs coloured by the alerts in force, recently published
 * flood reports, the alerts themselves, and a way to report flooding. Refreshed every 30 seconds
 * (usePublicAlertMap). When an administrator enables `showPublicFloodOutlook`, also displays the
 * clearly badged Modelled Flood Outlook section below the official alerts.
 */
export function AlertsSection({ alertMap, error, outline, outlineLoading, signedIn }: AlertsSectionProps) {
  const alerts = sortAlerts(alertMap?.alerts ?? []);
  const { outlook: publicOutlook } = usePublicFloodOutlook();

  return (
    <section id="alerts" className="landing-section" aria-labelledby="alerts-title">
      <div className="landing-section__inner">
        <header className="landing-section__header">
          <p className="landing-eyebrow">Live</p>
          <h2 id="alerts-title" className="landing-section__title">
            National alert map
          </h2>
          <p className="landing-section__lead">
            Flood alerts issued by government officials, by LGA or ward, with the flood reports coordinators have checked and published.
            {alertMap && ` Updated ${formatDateTime(alertMap.generatedAt)}.`}
          </p>
        </header>

        <div className="landing-alerts">
          <AlertMap
            outline={outline}
            loading={outlineLoading}
            severities={severityByLga(alerts)}
            wardSeverities={severityByWardLga(alerts)}
            reports={alertMap?.reports ?? []}
            reportDays={alertMap?.reportDays ?? 7}
            floods={alertMap?.floods ?? []}
            floodDays={alertMap?.floodDays ?? 3}
          />
          <div className="landing-alerts__list">
            {error && !alertMap ? (
              <p className="landing-alerts__clear">The alerts couldn't be loaded right now. In an emergency, call 112.</p>
            ) : alerts.length === 0 ? (
              <div className="landing-alerts__clear" data-cy="no-alerts">
                <Icon name="check" size={20} />
                <div>
                  <p className="landing-alerts__clear-title">No flood alerts in force</p>
                  <p>When officials issue an alert, it appears here and on the map straight away.</p>
                </div>
              </div>
            ) : (
              <ul className="flood-page__list" data-cy="landing-alerts">
                {alerts.map((alert) => (
                  <li key={alert.id}>
                    <AlertCard alert={alert} />
                  </li>
                ))}
              </ul>
            )}
            <div className="landing-alerts__guide" data-cy="alert-levels">
              <p className="landing-alerts__clear-title">What the alert levels mean</p>
              <ul>
                {ALERT_SEVERITIES.map((level) => (
                  <li key={level}>
                    <SeverityBadge severity={level} />
                    <span>
                      {SEVERITY_INFO[level].meaning} {SEVERITY_INFO[level].defaultActions[0]}
                    </span>
                  </li>
                ))}
              </ul>
              {alertMap && (
                <p className="landing-alerts__reports">
                  {alertMap.reports.length === 0
                    ? `No flood reports published in the last ${alertMap.reportDays} days.`
                    : `${alertMap.reports.length} flood ${alertMap.reports.length === 1 ? "report" : "reports"} published in the last ${alertMap.reportDays} days, shown as dots on the map.`}
                  {(alertMap.floods ?? []).length > 0 &&
                    ` ${alertMap.floods.length} ${alertMap.floods.length === 1 ? "flood" : "floods"} recorded on the ground by responders, shown as pink markers.`}
                </p>
              )}
            </div>
            <div className="landing-alerts__report">
              <div>
                <p className="landing-alerts__clear-title">Seeing flooding?</p>
                <p>Send coordinators the place, the water depth and a photo. Every report is checked before it goes on the map.</p>
              </div>
              <Link to="/report" className={buttonClassName({ variant: "danger" })} data-cy="landing-report-flooding">
                {signedIn ? "Report flooding" : "Sign in to report flooding"}
              </Link>
            </div>
          </div>
        </div>

        {publicOutlook?.enabled && publicOutlook.items.length > 0 && (
          <div className="card card__body section-gap" data-cy="public-flood-outlook">
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <h3 className="card__title" style={{ margin: 0 }}>
                    {publicOutlook.horizonDays}-Day Flood Outlook
                  </h3>
                  <Badge tone="neutral">Modelled</Badge>
                </div>
                <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.9rem" }}>
                  Modelled weather &amp; river discharge outlook by LGA ({publicOutlook.weatherProvider}). Distinct from official alerts in force above.
                </p>
              </div>
              {publicOutlook.generatedAt && (
                <span className="muted" style={{ fontSize: "0.82rem" }}>
                  Computed {formatDateTime(publicOutlook.generatedAt)}
                </span>
              )}
            </div>

            <div className="ward-grid">
              {publicOutlook.items.slice(0, 12).map((item) => {
                const info = PREDICTION_RISK_INFO[item.riskLevel];
                return (
                  <div key={item.adminUnit.id} className="card card__body" style={{ padding: "0.75rem" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                      <strong>{item.adminUnit.unitName}</strong>
                      <Badge tone={info.badgeTone}>{info.label}</Badge>
                    </div>
                    <p className="muted" style={{ margin: "0.35rem 0 0", fontSize: "0.84rem" }}>
                      {item.forecastRainfallMm} mm forecast rain · Score {item.likelihoodScore}/100
                    </p>
                    {item.topFactors[0] && (
                      <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>
                        {item.topFactors[0]}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
