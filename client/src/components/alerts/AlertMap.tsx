import { useMemo, useState } from "react";
import type { AlertSeverity } from "../../types/alert.types";
import type { PublicReportPoint } from "../../types/flood-report.types";
import type { PublicFloodPoint, PublicOutline } from "../../types/public.types";
import { SEVERITY_INFO } from "../../utils/alert-severity";
import { multiPolygonPath, outlineFrame } from "../../utils/outline-path";
import { describeFlood, floodMarkerRadius } from "../../utils/public-flood";
import { WATER_DEPTH_INFO } from "../../utils/water-depth";
import "./alerts.css";

interface AlertMapProps {
  outline: PublicOutline | null;
  loading: boolean;
  /** Each LGA's most severe alert in force. */
  severities: Record<string, AlertSeverity>;
  reports: PublicReportPoint[];
  reportDays: number;
  /** Floods a responder recorded on the ground and has not marked receded. */
  floods: PublicFloodPoint[];
  floodDays: number;
}

const WIDTH = 520;
const PADDING = 8;
const LEVELS: AlertSeverity[] = ["watch", "warning", "severe"];

/**
 * The national alert map: every LGA on the platform, coloured by its most severe alert in force,
 * with the flood reports reviewers have published as dots, and the floods responders recorded on
 * the ground as larger pink markers (sized by area, beneath the report dots). Plain SVG, like the landing page's
 * outline, so it costs no map load and works without a map token. The legend and the alert list
 * beside it carry the same information as text.
 */
export function AlertMap({ outline, loading, severities, reports, reportDays, floods, floodDays }: AlertMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const drawing = useMemo(() => {
    if (!outline?.bbox || outline.areas.features.length === 0) return null;
    const frame = outlineFrame(outline.bbox, WIDTH, PADDING);
    return {
      frame,
      areas: outline.areas.features.map((f) => ({ id: f.properties.id, name: f.properties.unitName, d: multiPolygonPath(f.geometry, frame) })),
    };
  }, [outline]);

  if (!drawing) {
    return <div className={`alert-map alert-map--empty${loading ? " alert-map--loading" : ""}`} aria-hidden="true" data-cy="alert-map" />;
  }

  const { frame, areas } = drawing;
  const alerted = areas.filter((a) => severities[a.id]).length;
  const hoveredArea = areas.find((a) => a.id === hovered);
  const recorded = floods.length > 0 ? ` · ${floods.length} recorded ${floods.length === 1 ? "flood" : "floods"}` : "";
  const caption = hoveredArea
    ? `${hoveredArea.name}: ${severities[hoveredArea.id] ? SEVERITY_INFO[severities[hoveredArea.id]!].label : "no alert in force"}`
    : alerted > 0
      ? `${alerted} of ${areas.length} LGAs under an alert${recorded}`
      : `No alerts in force across ${areas.length} LGAs${recorded}`;

  return (
    <figure className="alert-map" data-cy="alert-map">
      <svg
        className="alert-map__svg"
        viewBox={`0 0 ${frame.width} ${frame.height}`}
        role="img"
        aria-label={`Alert map: ${caption}. ${reports.length} published flood reports in the last ${reportDays} days.${floods.length > 0 ? ` ${floods.length} floods recorded on the ground in the last ${floodDays} days.` : ""}`}
        onPointerLeave={() => setHovered(null)}
      >
        {areas.map((area) => (
          <path
            key={area.id}
            d={area.d}
            fillRule="evenodd"
            className={`alert-map__area${severities[area.id] ? ` alert-map__area--${severities[area.id]}` : ""}`}
            onPointerEnter={() => setHovered(area.id)}
            data-cy="alert-map-area"
          >
            <title>{area.name}</title>
          </path>
        ))}
        {floods.map((flood) => {
          const [x, y] = frame.project(flood.point);
          return (
            <circle key={flood.id} cx={x.toFixed(1)} cy={y.toFixed(1)} r={floodMarkerRadius(flood.areaM2)} className="alert-map__flood" data-cy="alert-map-flood">
              <title>{describeFlood(flood)}</title>
            </circle>
          );
        })}
        {reports.map((report) => {
          const [x, y] = frame.project(report.point);
          return (
            <circle key={report.id} cx={x.toFixed(1)} cy={y.toFixed(1)} r="4" className={`alert-map__report alert-map__report--${report.waterDepth}`}>
              <title>
                {WATER_DEPTH_INFO[report.waterDepth].label} flooding reported{report.lgaName ? ` in ${report.lgaName}` : ""}
              </title>
            </circle>
          );
        })}
      </svg>
      <figcaption className="alert-map__caption" aria-live="polite">
        {caption}
      </figcaption>
      <ul className="alert-map__legend" aria-label="Map key">
        {LEVELS.map((level) => (
          <li key={level}>
            <span className={`alert-map__swatch alert-map__swatch--${level}`} aria-hidden="true" />
            {SEVERITY_INFO[level].label}
          </li>
        ))}
        <li>
          <span className="alert-map__swatch alert-map__swatch--report" aria-hidden="true" />
          Published report (last {reportDays} days)
        </li>
        <li>
          <span className="alert-map__swatch alert-map__swatch--flood" aria-hidden="true" />
          Flood recorded on the ground (last {floodDays} days)
        </li>
      </ul>
    </figure>
  );
}
