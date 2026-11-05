import { useState } from "react";
import { Popup } from "react-map-gl/mapbox";
import { useDrainInspections, useDrainPeople } from "../../hooks/useSurveyDetails";
import { DRAINAGE_CONDITIONS, type DrainageCondition, type SelectedSurvey, type UpdateDrainageBody } from "../../types/field-survey.types";
import type { PendingPhoto } from "../../types/photo.types";
import { isStaleCheck, DRAIN_STALE_DAYS } from "../../utils/drain-display";
import { CONDITION_INFO, DRAINAGE_KIND_LABEL, drainTitle, FLOW_LABEL, isLineKind, MATERIAL_LABEL } from "../../utils/field-survey";
import { formatDateTime } from "../../utils/formatDate";
import { formatDistance } from "../../utils/geo-distance";
import type { SurveyAbilities } from "../../utils/permissions";
import { quietFix } from "../../utils/quiet-fix";
import { roleLabel } from "../../utils/roles";
import { PhotoPicker } from "../photos/PhotoPicker";
import { MAX_PHOTOS, PhotoSection } from "../photos/PhotoSection";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { SelectField } from "../shared/SelectField";
import { TextAreaField } from "../shared/TextAreaField";
import { toInspection } from "./survey-form.schema";

type Drain = Extract<SelectedSurvey, { type: "drain" }>;
const TONE = { good: "success", warn: "warning", bad: "danger" } as const;

interface DrainagePopupProps {
  drain: Drain;
  abilities: SurveyAbilities;
  /** An inspection: saves the condition found, and moves "last checked" to now. Left out where the popup is only for reading (a place's page). */
  onInspect?: (id: string, body: UpdateDrainageBody, photos: PendingPhoto[]) => Promise<boolean>;
  onDelete?: () => void;
  onClose: () => void;
}

/** "Amina Okoro (Emergency Responder)", or just the role when the account has no name. */
const personText = (person: { name: string | null; role: string | null } | null) =>
  person ? [person.name, person.role ? `(${roleLabel(person.role)})` : null].filter(Boolean).join(" ") || "someone" : "someone whose account is gone";

/**
 * A recorded drain: what it is, the condition it was last found in and when, and, for staff, who
 * recorded and last checked it, its inspection history and its photos. Those allowed to inspect can
 * record a new check, which keeps who checked, what they found and (if the phone shares it) how far
 * from the drain they stood.
 */
export function DrainagePopup({ drain, abilities, onInspect, onDelete, onClose }: DrainagePopupProps) {
  const { properties, point } = drain;
  const [condition, setCondition] = useState<DrainageCondition>(properties.condition);
  const [inspectionNote, setInspectionNote] = useState("");
  const [shareSpot, setShareSpot] = useState(true);
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [inspecting, setInspecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const people = useDrainPeople(properties.id, abilities.viewPeople) ?? null;
  const { inspections: history } = useDrainInspections(properties.id, abilities.viewPeople && showHistory);

  const sizes = [
    properties.lengthM !== null ? `${formatDistance(properties.lengthM)} long` : null,
    properties.widthM !== null ? `${properties.widthM} m wide` : null,
    properties.depthM !== null ? `${properties.depthM} m deep` : null,
    properties.diameterM ? `${properties.diameterM} m pipe${properties.barrels && properties.barrels > 1 ? ` × ${properties.barrels}` : ""}` : null,
    properties.material ? MATERIAL_LABEL[properties.material] : null,
  ].filter(Boolean);
  const stale = isStaleCheck(properties.lastCheckedAt);

  const inspect = async () => {
    setBusy(true);
    const at = shareSpot ? await quietFix() : null;
    await onInspect?.(properties.id, toInspection(condition, inspectionNote, at), photos);
    setBusy(false);
  };

  // Deleting is for whoever recorded it (with survey.delete_own) or anyone with survey.delete_any. Without
  // the names (survey.view_people) the recorder isn't known here, so it is offered and the server decides.
  const mayDelete = abilities.deleteAny || (abilities.deleteOwn && (!people || people.recordedBy?.id === abilities.userId));

  return (
    <Popup longitude={point[0]} latitude={point[1]} anchor="bottom" offset={8} maxWidth="320px" closeOnClick={false} onClose={onClose} className="admin-unit-popup">
      <div className="survey-popup" data-cy="drain-popup">
        <p className="location-summary__title" data-cy="drain-title">
          {drainTitle(properties)}
        </p>
        <p className="survey-popup__meta">
          {DRAINAGE_KIND_LABEL[properties.kind]} <Badge tone={TONE[CONDITION_INFO[properties.condition].tone]} dataCy="drain-condition">{CONDITION_INFO[properties.condition].label}</Badge>
          {properties.method === "import" && <span> · from a drainage plan</span>}
        </p>
        {sizes.length > 0 && <p className="survey-popup__meta">{sizes.join(" · ")}</p>}
        {isLineKind(properties.kind) && properties.flowDirection && (
          <p className="survey-popup__meta" data-cy="drain-flow">
            <Icon name="arrowRight" size={12} /> Water flows {properties.flowDirection === "with_line" ? "the way it was walked" : "against the way it was walked"}
            <span className="visually-hidden">: {FLOW_LABEL[properties.flowDirection]}</span>
          </p>
        )}
        {properties.note && <p className="saved-place__note">{properties.note}</p>}
        <p className="survey-popup__meta">
          Last checked {formatDateTime(properties.lastCheckedAt)}
          {abilities.viewPeople && people?.lastCheckedBy && <> by {personText(people.lastCheckedBy)}</>}
          {stale && <span className="survey-popup__stale"> · not checked in {DRAIN_STALE_DAYS}+ days</span>}
        </p>
        {abilities.viewPeople && people && (
          <p className="survey-popup__meta" data-cy="drain-recorded-by">
            Recorded by {personText(people.recordedBy)}
          </p>
        )}

        {abilities.viewPeople && (
          <div className="survey-popup__history">
            <Button variant="ghost" size="sm" icon={<Icon name="history" size={14} />} aria-expanded={showHistory} onClick={() => setShowHistory((open) => !open)} data-cy="drain-history-toggle">
              {showHistory ? "Hide inspections" : "Inspection history"}
            </Button>
            {showHistory && (
              <ol className="survey-popup__history-list" data-cy="drain-history">
                {history === null && <li>Loading…</li>}
                {history?.length === 0 && <li>No inspections recorded yet.</li>}
                {history?.map((item) => (
                  <li key={item.id}>
                    <strong>{formatDateTime(item.inspectedAt)}</strong> · {item.inspectorName ?? "someone"} ({roleLabel(item.inspectorRole)}):{" "}
                    {item.conditionBefore === item.conditionAfter ? `still ${CONDITION_INFO[item.conditionAfter].label.toLowerCase()}` : `${CONDITION_INFO[item.conditionBefore].label} → ${CONDITION_INFO[item.conditionAfter].label}`}
                    {item.distanceM !== null && <span className="survey-popup__history-detail"> · {formatDistance(item.distanceM)} away</span>}
                    {item.photoCount > 0 && <span className="survey-popup__history-detail"> · {item.photoCount} photo{item.photoCount === 1 ? "" : "s"}</span>}
                    {item.note && <span className="survey-popup__history-note">{item.note}</span>}
                    {abilities.viewPhotos && item.photoCount > 0 && <PhotoSection subject={{ type: "inspection", id: item.id }} abilities={{ ...abilities, addPhotos: false }} of="this inspection" knownCount={item.photoCount} />}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        <PhotoSection subject={{ type: "drain", id: properties.id }} abilities={abilities} of={drainTitle(properties)} knownCount={properties.photoCount} />

        {onInspect && abilities.inspectDrain && !inspecting && (
          <div className="survey-popup__actions">
            <Button variant="secondary" size="sm" icon={<Icon name="check" size={14} />} onClick={() => setInspecting(true)} data-cy="start-inspection">
              I checked it
            </Button>
            {onDelete && mayDelete && (
              <Button variant="danger" size="sm" icon={<Icon name="trash" size={14} />} onClick={onDelete} data-cy="delete-drain">
                Delete
              </Button>
            )}
          </div>
        )}
        {onInspect && !abilities.inspectDrain && onDelete && mayDelete && (
          <div className="survey-popup__actions">
            <Button variant="danger" size="sm" icon={<Icon name="trash" size={14} />} onClick={onDelete} data-cy="delete-drain">
              Delete
            </Button>
          </div>
        )}
        {onInspect && inspecting && (
          <div className="survey-popup__inspect" data-cy="inspection-form">
            <SelectField label="Condition now" value={condition} onChange={(event) => setCondition(event.target.value as DrainageCondition)} data-cy="inspect-condition">
              {DRAINAGE_CONDITIONS.map((value) => (
                <option key={value} value={value}>
                  {CONDITION_INFO[value].label}: {CONDITION_INFO[value].meaning}
                </option>
              ))}
            </SelectField>
            <TextAreaField label="What you found (optional)" rows={2} maxLength={500} value={inspectionNote} onChange={(event) => setInspectionNote(event.target.value)} data-cy="inspect-note" />
            <label className="field-dock__tap">
              <input type="checkbox" checked={shareSpot} onChange={(event) => setShareSpot(event.target.checked)} data-cy="inspect-share-spot" />
              <span>Record where I'm standing (kept with this check, for staff only)</span>
            </label>
            {abilities.addPhotos && <PhotoPicker photos={photos} onChange={setPhotos} max={MAX_PHOTOS} of="this inspection" disabled={busy} />}
            <div className="survey-popup__actions">
              <Button size="sm" icon={<Icon name="check" size={14} />} loading={busy} loadingLabel="Saving…" onClick={() => void inspect()} data-cy="save-inspection">
                Save inspection
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => setInspecting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Popup>
  );
}
