import { Link } from "react-router";
import type { FloodAlert } from "../../types/alert.types";
import { highestSeverity, SEVERITY_INFO } from "../../utils/alert-severity";
import "./alerts.css";

interface AlertStripProps {
  /** The alerts in force now; null while they load (nothing is shown until they arrive). */
  alerts: FloodAlert[] | null;
  /** Where "See alerts" goes. */
  to: string;
}

/**
 * The live status line under the header: green "No flood alerts in force", or the count of alerts
 * in the colour of the most severe one. It is a status region, so screen readers hear changes.
 */
export function AlertStrip({ alerts, to }: AlertStripProps) {
  if (!alerts) return null;
  const top = highestSeverity(alerts.map((a) => a.severity));
  const text = top
    ? `${alerts.length} flood ${alerts.length === 1 ? "alert" : "alerts"} in force, the highest a ${SEVERITY_INFO[top].label.toLowerCase()}.`
    : "No flood alerts in force right now.";

  return (
    <div className={`alert-strip alert-strip--${top ?? "clear"}`} role="status" data-cy="alert-strip">
      <div className="alert-strip__inner">
        <span className="alert-strip__pulse" aria-hidden="true" />
        <span>{text}</span>
        <Link to={to}>{top ? "See the alerts" : "Alert map"}</Link>
      </div>
    </div>
  );
}
