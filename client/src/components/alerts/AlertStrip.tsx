import { Link } from "react-router";
import type { FloodAlert } from "../../types/alert.types";
import type { PublicReportPoint } from "../../types/flood-report.types";
import { stripStatus } from "../../utils/alert-strip";
import "./alerts.css";

interface AlertStripProps {
  /** The alerts in force now; null while they load (nothing is shown until they arrive). */
  alerts: FloodAlert[] | null;
  /** The community reports published in the last `reportDays` days. */
  reports?: PublicReportPoint[];
  reportDays?: number;
  /** Where the link goes. */
  to: string;
}

/**
 * The live status line under the header: the count of alerts in force in the colour of the most
 * severe one; amber when there are no alerts but community flood reports have been published; and
 * green only when there is neither (utils/alert-strip.ts). It is a status region, so screen readers
 * hear changes.
 */
export function AlertStrip({ alerts, reports = [], reportDays = 7, to }: AlertStripProps) {
  if (!alerts) return null;
  const { tone, text, linkLabel } = stripStatus(alerts, reports, reportDays);

  return (
    <div className={`alert-strip alert-strip--${tone}`} role="status" data-cy="alert-strip">
      <div className="alert-strip__inner">
        <span className="alert-strip__pulse" aria-hidden="true" />
        <span>{text}</span>
        <Link to={to}>{linkLabel}</Link>
      </div>
    </div>
  );
}
