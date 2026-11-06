import type { SatelliteFloodLayer } from "../../types/satellite-flood.types";
import { formatYearMonth } from "../../utils/rainfall-summary";
import { formatKm2 } from "../../utils/satellite-flood";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { SelectField } from "../shared/SelectField";

interface SatelliteFloodPanelProps {
  /** Every live month, newest first. */
  months: SatelliteFloodLayer[];
  /** The month shown. */
  layer: SatelliteFloodLayer;
  onChoose: (yearMonth: string) => void;
  loading?: boolean;
}

/**
 * Which month of satellite water the map shows, with the previous and next month a tap away, and
 * how much of the LGAs was water that month. Shown only while the layer is on.
 */
export function SatelliteFloodPanel({ months, layer, onChoose, loading = false }: SatelliteFloodPanelProps) {
  const at = months.findIndex((m) => m.id === layer.id);
  const older = months[at + 1] ?? null;
  const newer = at > 0 ? months[at - 1]! : null;
  return (
    <section className="map-panel satellite-flood-panel" aria-label="Satellite flood month" data-cy="satellite-flood-panel">
      <p className="map-panel__title">Water seen by satellite</p>
      <div className="satellite-flood-panel__row">
        <Button variant="ghost" size="sm" icon={<Icon name="chevronLeft" size={16} />} disabled={!older} onClick={() => older && onChoose(older.yearMonth)} aria-label="Earlier month" data-cy="satellite-flood-older" />
        <SelectField label="Month" className="satellite-flood-panel__select" value={layer.yearMonth} onChange={(event) => onChoose(event.target.value)} data-cy="satellite-flood-month">
          {months.map((m) => (
            <option key={m.id} value={m.yearMonth}>
              {formatYearMonth(m.yearMonth)}
            </option>
          ))}
        </SelectField>
        <Button variant="ghost" size="sm" icon={<Icon name="chevronRight" size={16} />} disabled={!newer} onClick={() => newer && onChoose(newer.yearMonth)} aria-label="Later month" data-cy="satellite-flood-newer" />
      </div>
      <p className="satellite-flood-panel__figure" aria-live="polite">
        {loading ? (
          <span className="muted">Loading {formatYearMonth(layer.yearMonth)}…</span>
        ) : (
          <>
            <strong>{formatKm2(layer.floodedKm2)} km²</strong> of the LGAs was water ({layer.percentFlooded}%), including rivers and creeks.
          </>
        )}
      </p>
    </section>
  );
}
