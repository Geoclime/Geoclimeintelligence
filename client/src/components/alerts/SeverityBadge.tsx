import type { AlertSeverity } from "../../types/alert.types";
import { SEVERITY_INFO } from "../../utils/alert-severity";
import "./alerts.css";

/** "Flood warning", in the level's colour, with a shape cue so colour is never the only signal. */
export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return (
    <span className={`severity-badge severity-badge--${severity}`} data-cy="severity-badge">
      <span className="severity-badge__dot" aria-hidden="true" />
      {SEVERITY_INFO[severity].label}
    </span>
  );
}
