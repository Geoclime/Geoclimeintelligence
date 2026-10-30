import type { ReactNode } from "react";
import type { FloodAlert } from "../../types/alert.types";
import { SEVERITY_INFO } from "../../utils/alert-severity";
import { areaTitle } from "../../utils/area-title";
import { formatDateTime } from "../../utils/formatDate";
import { SeverityBadge } from "./SeverityBadge";
import "./alerts.css";

const STATUS_TEXT: Record<FloodAlert["status"], string> = {
  active: "In force",
  scheduled: "Starts later",
  expired: "Expired",
  ended: "Ended early",
};

/** One alert: its level and what it means, where, what to do, and when it applies. */
export function AlertCard({ alert, action }: { alert: FloodAlert; action?: ReactNode }) {
  const inForce = alert.status === "active";
  return (
    <article className={`alert-card alert-card--${alert.severity}${inForce ? "" : " alert-card--inactive"}`} data-cy="alert-card">
      <header className="alert-card__header">
        <SeverityBadge severity={alert.severity} />
        <span className="alert-card__status">{STATUS_TEXT[alert.status]}</span>
      </header>
      <h3 className="alert-card__title">{alert.title}</h3>
      <p className="alert-card__areas">{alert.areas.map((area) => areaTitle(area.unitName, area.levelName)).join(", ")}</p>
      <p className="alert-card__meaning">{SEVERITY_INFO[alert.severity].meaning}</p>
      <p className="alert-card__message">{alert.message}</p>
      {alert.actions.length > 0 && (
        <div className="alert-card__actions">
          <p className="alert-card__actions-title">What to do</p>
          <ul>
            {alert.actions.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </div>
      )}
      <footer className="alert-card__footer">
        <span>
          {alert.status === "scheduled" ? "From" : "Issued"} {formatDateTime(alert.startsAt)} ·{" "}
          {alert.endedAt ? `ended ${formatDateTime(alert.endedAt)}` : `${inForce ? "until" : "expired"} ${formatDateTime(alert.expiresAt)}`}
        </span>
        {action}
      </footer>
    </article>
  );
}
