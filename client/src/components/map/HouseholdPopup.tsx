import { useState } from "react";
import { Popup } from "react-map-gl/mapbox";
import type { HouseholdOnMap } from "../../types/household.types";
import { describeHomeType } from "../../utils/household-details";
import { formatPhone } from "../../utils/phone";
import { Badge } from "../shared/Badge";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { HouseholdPhotos } from "./HouseholdPhotos";
import { CoordinatesLink } from "./LocationSummary";

interface HouseholdPopupProps {
  household: HouseholdOnMap;
  onEdit: () => void;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

/**
 * A household, opened by clicking it: its name and who lives there. Your own can be changed or removed;
 * staff see other people's (with who added them) read-only, for planning and rescue.
 */
export function HouseholdPopup({ household, onEdit, onDelete, onClose }: HouseholdPopupProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Popup longitude={household.point[0]} latitude={household.point[1]} offset={14} maxWidth="min(280px, calc(100vw - 2rem))" closeOnClick={false} onClose={onClose} className="admin-unit-popup">
      <div className="saved-place" data-cy="household-popup">
        <p className="location-summary__title">
          {household.label} {household.mine ? <Badge tone="primary">Yours</Badge> : <Badge tone="neutral">Household</Badge>}
        </p>
        <p className="saved-place__kind">
          {describeHomeType(household.homeType) ? `${describeHomeType(household.homeType)}. ` : ""}
          {household.mine ? "Only you and staff can see it." : `Added by ${household.ownerName ?? "someone"}. Visible to staff only.`}
          {household.people ? ` ${household.people} ${household.people === 1 ? "person lives" : "people live"} here.` : ""}
        </p>
        <CoordinatesLink point={household.point} />
        {household.phone && (
          <p className="saved-place__phone" data-cy="household-phone-link">
            <Icon name="phone" size={14} /> <a href={`tel:${household.phone}`}>{formatPhone(household.phone)}</a>
          </p>
        )}
        {household.note && <p className="saved-place__note">{household.note}</p>}
        <HouseholdPhotos household={household} />
        {household.mine && !confirming && (
          <div className="saved-place__actions">
            <Button variant="secondary" size="sm" icon={<Icon name="edit" size={14} />} onClick={onEdit} data-cy="edit-household">
              Edit
            </Button>
            <Button variant="danger" size="sm" icon={<Icon name="trash" size={14} />} onClick={() => setConfirming(true)} data-cy="delete-household">
              Remove
            </Button>
          </div>
        )}
        {household.mine && confirming && (
          <div className="saved-place__actions">
            <Button
              variant="danger"
              size="sm"
              loading={busy}
              loadingLabel="Removing…"
              onClick={async () => {
                setBusy(true);
                await onDelete();
                setBusy(false);
              }}
              data-cy="confirm-delete-household"
            >
              Remove it
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
              Keep it
            </Button>
          </div>
        )}
      </div>
    </Popup>
  );
}
