import { useMemo, useState } from "react";
import type { LonLat } from "../../types/admin-unit.types";
import type { PublicOutline } from "../../types/public.types";
import { multiPolygonPath, outlineFrame } from "../../utils/outline-path";

interface StateOutlineProps {
  outline: PublicOutline | null;
  loading: boolean;
  selectedId: string | null;
  /** A point to mark, e.g. a community or the visitor's location. */
  marker: LonLat | null;
  onSelect: (id: string, name: string) => void;
}

const WIDTH = 520;
const PADDING = 8;

/**
 * The hero's drawing of the state: every LGA, simplified, as an SVG (no map tiles, so the landing
 * page costs no map load). Pointer users can hover an LGA for its name and click to look it up;
 * the place finder beside it offers the same by keyboard, so the drawing itself is not a tab stop.
 */
export function StateOutline({ outline, loading, selectedId, marker, onSelect }: StateOutlineProps) {
  const [hovered, setHovered] = useState<{ id: string; name: string } | null>(null);

  const drawing = useMemo(() => {
    if (!outline?.bbox || outline.areas.features.length === 0) return null;
    const frame = outlineFrame(outline.bbox, WIDTH, PADDING);
    return {
      frame,
      areas: outline.areas.features.map((feature) => ({
        id: feature.properties.id,
        name: feature.properties.unitName,
        d: multiPolygonPath(feature.geometry, frame),
      })),
    };
  }, [outline]);

  if (!drawing) {
    return (
      <div className={`state-outline state-outline--empty${loading ? " state-outline--loading" : ""}`} aria-hidden="true" data-cy="state-outline" />
    );
  }

  const { frame, areas } = drawing;
  const selectedName = areas.find((a) => a.id === selectedId)?.name ?? null;
  const label = hovered?.name ?? selectedName;
  const pin = marker ? frame.project(marker) : null;

  return (
    <figure className="state-outline" data-cy="state-outline">
      <svg
        className="state-outline__svg"
        viewBox={`0 0 ${frame.width} ${frame.height}`}
        role="img"
        aria-label={`Outline of the ${areas.length} local government areas on the platform`}
        onPointerLeave={() => setHovered(null)}
      >
        {areas.map((area) => (
          <path
            key={area.id}
            d={area.d}
            fillRule="evenodd"
            className={`state-outline__area${area.id === selectedId ? " state-outline__area--selected" : ""}`}
            onPointerEnter={() => setHovered({ id: area.id, name: area.name })}
            onClick={() => onSelect(area.id, area.name)}
            data-cy="state-outline-area"
          >
            <title>{area.name}</title>
          </path>
        ))}
        {pin && (
          <g className="state-outline__pin" transform={`translate(${pin[0].toFixed(1)} ${pin[1].toFixed(1)})`}>
            <circle r="11" className="state-outline__pin-halo" />
            <circle r="4.5" className="state-outline__pin-dot" />
          </g>
        )}
      </svg>
      <figcaption className="state-outline__caption" aria-live="polite">
        {label ? (
          <span className="state-outline__name">{label}</span>
        ) : (
          <span className="state-outline__hint">Hover an LGA for its name. Click to look it up.</span>
        )}
      </figcaption>
    </figure>
  );
}
