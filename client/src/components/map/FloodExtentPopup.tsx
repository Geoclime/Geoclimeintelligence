import { useState } from "react";
import { Popup } from "react-map-gl/mapbox";
import type { SelectedSurvey } from "../../types/field-survey.types";
import { formatDateTime } from "../../utils/formatDate";
import { formatArea } from "../../utils/survey-geometry";
import { WATER_DEPTH_INFO } from "../../utils/water-depth";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { FloodImpactSummary } from "./FloodImpactSummary";

type Flood = Extract<SelectedSurvey, { type: "flood" }>;

interface FloodExtentPopupProps {
  flood: Flood;
  /** Responders, officials and administrators can mark a flood receded and delete one. */
  canRecord: boolean;
  /** Left out where the popup is only for reading (a place's page): nothing is then offered to change. */
  onRecede?: (id: string) => Promise<boolean>;
  onDelete?: () => void;
  onClose: () => void;
}

/** A recorded flood: how big, how deep, when, what it reaches and which drains are near, and (for staff) calling it over. */
export function FloodExtentPopup({ flood, canRecord, onRecede, onDelete, onClose }: FloodExtentPopupProps) {
  const { properties, point, impact } = flood;
  const [busy, setBusy] = useState(false);

  const recede = async () => {
    setBusy(true);
    await onRecede?.(properties.id);
    setBusy(false);
  };

  return (
    <Popup longitude={point[0]} latitude={point[1]} anchor="bottom" offset={8} maxWidth="320px" closeOnClick={false} onClose={onClose} className="admin-unit-popup">
      <div className="survey-popup" data-cy="flood-popup">
        <p className="location-summary__title">
          Flood {properties.receded ? <Badge tone="neutral">Receded</Badge> : <Badge tone="info">Active</Badge>}
        </p>
        <p className="survey-popup__figure" data-cy="flood-area">
          {formatArea(properties.areaM2)}
          <span>
            {properties.depth ? ` · ${WATER_DEPTH_INFO[properties.depth].label}` : ""} · {properties.method === "walked" ? "walked with GPS" : "drawn on the map"}
          </span>
        </p>
        <p className="survey-popup__meta">Recorded {formatDateTime(properties.observedAt)}</p>
        <FloodImpactSummary id={properties.id} initial={impact} />
        {canRecord && onRecede && onDelete && (
          <div className="survey-popup__actions">
            {!properties.receded && (
              <Button variant="secondary" size="sm" icon={<Icon name="check" size={14} />} loading={busy} loadingLabel="Saving…" onClick={() => void recede()} data-cy="recede-flood">
                Water has gone down
              </Button>
            )}
            <Button variant="danger" size="sm" icon={<Icon name="trash" size={14} />} disabled={busy} onClick={onDelete} data-cy="delete-flood">
              Delete
            </Button>
          </div>
        )}
      </div>
    </Popup>
  );
}
