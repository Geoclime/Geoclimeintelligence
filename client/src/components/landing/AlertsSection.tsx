import { Link } from "react-router";
import { ALERT_SEVERITIES } from "../../types/alert.types";
import type { PublicAlertMap, PublicOutline } from "../../types/public.types";
import { SEVERITY_INFO, severityByLga, sortAlerts } from "../../utils/alert-severity";
import { SeverityBadge } from "../alerts/SeverityBadge";
import { formatDateTime } from "../../utils/formatDate";
import { AlertCard } from "../alerts/AlertCard";
import { AlertMap } from "../alerts/AlertMap";
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
 * (usePublicAlertMap).
 */
export function AlertsSection({ alertMap, error, outline, outlineLoading, signedIn }: AlertsSectionProps) {
  const alerts = sortAlerts(alertMap?.alerts ?? []);

  return (
    <section id="alerts" className="landing-section" aria-labelledby="alerts-title">
      <div className="landing-section__inner">
        <header className="landing-section__header">
          <p className="landing-eyebrow">Live</p>
          <h2 id="alerts-title" className="landing-section__title">
            National alert map
          </h2>
          <p className="landing-section__lead">
            Flood alerts issued by government officials, by LGA, with the flood reports coordinators have checked and published.
            {alertMap && ` Updated ${formatDateTime(alertMap.generatedAt)}.`}
          </p>
        </header>

        <div className="landing-alerts">
          <AlertMap
            outline={outline}
            loading={outlineLoading}
            severities={severityByLga(alerts)}
            reports={alertMap?.reports ?? []}
            reportDays={alertMap?.reportDays ?? 7}
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
      </div>
    </section>
  );
}
