import { useEffect, useRef, useState } from "react";
import { formatMm } from "../../utils/rainfall-summary";

/** One column: a month, or a year's total. */
export interface RainfallColumn {
  key: string;
  /** Under the column: "Aug", "2019". */
  label: string;
  /** A second line under some columns: the year under January. */
  sublabel?: string;
  /** Null draws a dash: no value (missing, incomplete, or a year still in progress). */
  valueMm: number | null;
  averageMm: number | null;
  /** The tooltip's heading and the column's accessible name: "August 2026", "2019 total". */
  title: string;
  /** Said in the tooltip when there's no value. */
  missingText?: string;
}

interface RainfallChartProps {
  columns: RainfallColumn[];
  /** Legend text for the columns: "Monthly rainfall", "Yearly total". */
  valueLabel: string;
  /** Legend text for the average ticks; null hides them from the legend (there are none). */
  averageLabel: string | null;
  /** Describes the chart for screen readers; the table view carries the values. */
  ariaLabel: string;
  /** When given, a column can be clicked (or Enter/Space) to choose it. */
  onSelect?: (key: string) => void;
  selectedKey?: string | null;
}

const HEIGHT = 220;
const MARGIN = { top: 12, right: 8, bottom: 40, left: 52 };
const MAX_BAR = 24;
const RADIUS = 4;

/** The container's width in pixels, so the chart draws at real size and its text never shrinks. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A clean axis: the top tick is a round number at or above the largest value. */
function niceScale(max: number): { top: number; ticks: number[] } {
  const steps = [10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const step = steps.find((s) => s * 4 >= max) ?? Math.ceil(max / 4 / 1000) * 1000;
  const top = Math.max(step, Math.ceil(max / step) * step);
  return { top, ticks: Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step) };
}

/** A column with a 4px rounded top and a square foot on the baseline. */
function columnPath(x: number, y: number, width: number, baseline: number): string {
  const r = Math.min(RADIUS, width / 2, baseline - y);
  return `M${x},${baseline} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${baseline} Z`;
}

/**
 * Rainfall as columns, each with a short tick at its average, so "wetter or drier than usual"
 * reads at a glance. One series plus a neutral reference: the legend names both. Every value is
 * also in the hover/focus tooltip and in the table under the chart, so nothing depends on colour.
 */
export function RainfallChart({ columns, valueLabel, averageLabel, ariaLabel, onSelect, selectedKey = null }: RainfallChartProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const values = columns.flatMap((c) => [c.valueMm ?? 0, c.averageMm ?? 0]);
  const { top, ticks } = niceScale(Math.max(1, ...values));
  const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
  const baseline = HEIGHT - MARGIN.bottom;
  const slot = plotWidth / Math.max(1, columns.length);
  const bar = Math.min(MAX_BAR, slot * 0.6);
  const y = (mm: number) => MARGIN.top + (1 - mm / top) * (baseline - MARGIN.top);
  const centre = (i: number) => MARGIN.left + slot * i + slot / 2;
  const current = active === null ? null : columns[active];

  return (
    <figure className="rainfall-chart">
      <div className="rainfall-chart__legend" aria-hidden="true">
        <span className="rainfall-chart__key">
          <span className="rainfall-chart__swatch" />
          {valueLabel}
        </span>
        {averageLabel && (
          <span className="rainfall-chart__key">
            <span className="rainfall-chart__line-key" />
            {averageLabel}
          </span>
        )}
      </div>
      <div ref={ref} className="rainfall-chart__plot" onPointerLeave={() => setActive(null)}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label={ariaLabel}>
            {ticks.map((tick) => (
              <g key={tick}>
                <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(tick)} y2={y(tick)} className="rainfall-chart__grid" />
                <text x={MARGIN.left - 8} y={y(tick)} className="rainfall-chart__tick" textAnchor="end" dominantBaseline="middle">
                  {tick.toLocaleString("en")}
                </text>
              </g>
            ))}
            <text x={4} y={MARGIN.top - 2} className="rainfall-chart__tick">
              mm
            </text>

            {columns.map((c, i) => {
              const x = centre(i) - bar / 2;
              const classes = ["rainfall-chart__month", active === i && "is-active", selectedKey === c.key && "is-selected"].filter(Boolean).join(" ");
              const label = `${c.title}: ${c.valueMm === null ? (c.missingText ?? "no value") : formatMm(c.valueMm)}${
                c.averageMm === null ? "" : `, average ${formatMm(c.averageMm)}`
              }`;
              return (
                <g key={c.key} className={classes}>
                  {c.valueMm !== null ? (
                    <path d={columnPath(x, y(c.valueMm), bar, baseline)} className="rainfall-chart__bar" />
                  ) : (
                    <text x={centre(i)} y={baseline - 6} className="rainfall-chart__missing" textAnchor="middle">
                      –
                    </text>
                  )}
                  {c.averageMm !== null && (
                    <>
                      {/* A surface-coloured ring under the tick keeps it legible across the column. */}
                      <line x1={x - 3} x2={x + bar + 3} y1={y(c.averageMm)} y2={y(c.averageMm)} className="rainfall-chart__average-ring" />
                      <line x1={x - 3} x2={x + bar + 3} y1={y(c.averageMm)} y2={y(c.averageMm)} className="rainfall-chart__average" />
                    </>
                  )}
                  <text x={centre(i)} y={baseline + 16} className="rainfall-chart__tick rainfall-chart__label" textAnchor="middle">
                    {c.label}
                  </text>
                  {c.sublabel && (
                    <text x={centre(i)} y={baseline + 31} className="rainfall-chart__tick rainfall-chart__tick--year" textAnchor="middle">
                      {c.sublabel}
                    </text>
                  )}
                  {/* The hit target is the whole slot, not just the column. */}
                  <rect
                    x={MARGIN.left + slot * i}
                    y={MARGIN.top}
                    width={slot}
                    height={baseline - MARGIN.top}
                    className={onSelect ? "rainfall-chart__hit rainfall-chart__hit--selectable" : "rainfall-chart__hit"}
                    tabIndex={0}
                    role={onSelect ? "button" : undefined}
                    aria-pressed={onSelect ? selectedKey === c.key : undefined}
                    aria-label={onSelect ? `${label}. Show its months` : label}
                    onPointerEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    onClick={onSelect ? () => onSelect(c.key) : undefined}
                    onKeyDown={
                      onSelect
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelect(c.key);
                            }
                          }
                        : undefined
                    }
                  />
                </g>
              );
            })}
            <line x1={MARGIN.left} x2={width - MARGIN.right} y1={baseline} y2={baseline} className="rainfall-chart__baseline" />
          </svg>
        )}
        {current && active !== null && (
          <div
            className="rainfall-chart__tooltip"
            role="status"
            style={{ left: Math.min(Math.max(centre(active), 80), width - 80), top: Math.max(0, y(Math.max(current.valueMm ?? 0, current.averageMm ?? 0)) - 8) }}
          >
            <strong>{current.valueMm === null ? (current.missingText ?? "No value") : formatMm(current.valueMm)}</strong>
            <span>{current.title}</span>
            {current.averageMm !== null && (
              <span className="rainfall-chart__tooltip-row">
                <span className="rainfall-chart__line-key" />
                {formatMm(current.averageMm)} average
              </span>
            )}
            {onSelect && <span className="rainfall-chart__hint">Click to see its months</span>}
          </div>
        )}
      </div>
    </figure>
  );
}
