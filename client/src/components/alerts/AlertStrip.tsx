import { useRef } from "react";
import { Link } from "react-router";
import { useTicker } from "../../hooks/useTicker";
import type { FloodAlert } from "../../types/alert.types";
import type { PublicReportPoint } from "../../types/flood-report.types";
import type { PublicFloodPoint } from "../../types/public.types";
import { stripStatus } from "../../utils/alert-strip";
import "./alerts.css";

interface AlertStripProps {
  /** The alerts in force now; null while they load (nothing is shown until they arrive). */
  alerts: FloodAlert[] | null;
  /** The community reports published in the last `reportDays` days. */
  reports?: PublicReportPoint[];
  reportDays?: number;
  /** The floods responders recorded on the ground in the last `floodDays` days, not yet receded. */
  floods?: PublicFloodPoint[];
  floodDays?: number;
  /** Where the link goes. */
  to: string;
}

/**
 * The live status line under the header: the count of alerts in force in the colour of the most
 * severe one; amber when there are no alerts but community flood reports have been published or a
 * flood has been recorded on the ground; and green only when there is none of these (utils/alert-strip.ts).
 *
 * A sentence that doesn't fit scrolls across like a news ticker, with the link kept in place on the
 * right, instead of wrapping and leaving the link alone on a second line. It holds still while the
 * pointer is over it, and anyone who has asked their device for less motion gets the plain line
 * instead. It is a status region, so screen readers hear changes: they read the text once, never the
 * copy that makes the loop seamless.
 */
export function AlertStrip({ alerts, reports = [], reportDays = 7, floods = [], floodDays = 3, to }: AlertStripProps) {
  const status = alerts ? stripStatus(alerts, reports, reportDays, floods, floodDays) : null;
  const viewportRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const { scrolling, seconds } = useTicker(status?.text ?? "", viewportRef, textRef);
  if (!status) return null;
  const { tone, text, linkLabel } = status;

  return (
    <div className={`alert-strip alert-strip--${tone}`} role="status" data-cy="alert-strip">
      <div className="alert-strip__inner">
        <span className="alert-strip__pulse" aria-hidden="true" />
        <div ref={viewportRef} className={`alert-strip__ticker${scrolling ? " is-scrolling" : ""}`} data-cy="alert-strip-ticker">
          <span className="alert-strip__track" style={scrolling ? { animationDuration: `${seconds}s` } : undefined}>
            <span className="alert-strip__copy">
              <span ref={textRef}>{text}</span>
            </span>
            {scrolling && (
              <span className="alert-strip__copy" aria-hidden="true">
                {text}
              </span>
            )}
          </span>
        </div>
        <Link to={to}>{linkLabel}</Link>
      </div>
    </div>
  );
}
