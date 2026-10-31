import { useState } from "react";
import { Popup } from "react-map-gl/mapbox";
import { DRAINAGE_CONDITIONS, type DrainageCondition, type SelectedSurvey, type UpdateDrainageBody } from "../../types/field-survey.types";
import { CONDITION_INFO, DRAINAGE_KIND_LABEL, drainTitle } from "../../utils/field-survey";
import { formatDateTime } from "../../utils/formatDate";
import { formatDistance } from "../../utils/geo-distance";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { SelectField } from "../shared/SelectField";

type Drain = Extract<SelectedSurvey, { type: "drain" }>;
const TONE = { good: "success", warn: "warning", bad: "danger" } as const;

interface DrainagePopupProps {
  drain: Drain;
  canRecord: boolean;
  /** An inspection: saves the condition found, and moves "last checked" to now. Left out where the popup is only for reading (a place's page). */
  onInspect?: (id: string, body: UpdateDrainageBody) => Promise<boolean>;
  onDelete?: () => void;
  onClose: () => void;
}

/** A recorded drain: what it is, the condition it was last found in and when, and (for staff) a quick re-inspection. */
export function DrainagePopup({ drain, canRecord, onInspect, onDelete, onClose }: DrainagePopupProps) {
  const { properties, point } = drain;
  const [condition, setCondition] = useState<DrainageCondition>(properties.condition);
  const [busy, setBusy] = useState(false);
  const sizes = [
    properties.lengthM !== null ? `${formatDistance(properties.lengthM)} long` : null,
    properties.widthM !== null ? `${properties.widthM} m wide` : null,
    properties.depthM !== null ? `${properties.depthM} m deep` : null,
  ].filter(Boolean);

  const inspect = async () => {
    setBusy(true);
    await onInspect?.(properties.id, { condition });
    setBusy(false);
  };

  return (
    <Popup longitude={point[0]} latitude={point[1]} anchor="bottom" offset={8} maxWidth="300px" closeOnClick={false} onClose={onClose} className="admin-unit-popup">
      <div className="survey-popup" data-cy="drain-popup">
        <p className="location-summary__title" data-cy="drain-title">
          {drainTitle(properties)}
        </p>
        <p className="survey-popup__meta">
          {DRAINAGE_KIND_LABEL[properties.kind]} <Badge tone={TONE[CONDITION_INFO[properties.condition].tone]} dataCy="drain-condition">{CONDITION_INFO[properties.condition].label}</Badge>
        </p>
        {sizes.length > 0 && <p className="survey-popup__meta">{sizes.join(" · ")}</p>}
        {properties.note && <p className="saved-place__note">{properties.note}</p>}
        <p className="survey-popup__meta">Last checked {formatDateTime(properties.lastCheckedAt)}</p>
        {canRecord && onInspect && onDelete && (
          <>
            <SelectField label="Condition now" value={condition} onChange={(event) => setCondition(event.target.value as DrainageCondition)} data-cy="inspect-condition">
              {DRAINAGE_CONDITIONS.map((value) => (
                <option key={value} value={value}>
                  {CONDITION_INFO[value].label}: {CONDITION_INFO[value].meaning}
                </option>
              ))}
            </SelectField>
            <div className="survey-popup__actions">
              <Button variant="secondary" size="sm" icon={<Icon name="check" size={14} />} loading={busy} loadingLabel="Saving…" onClick={() => void inspect()} data-cy="save-inspection">
                I checked it
              </Button>
              <Button variant="danger" size="sm" icon={<Icon name="trash" size={14} />} disabled={busy} onClick={onDelete} data-cy="delete-drain">
                Delete
              </Button>
            </div>
          </>
        )}
      </div>
    </Popup>
  );
}
