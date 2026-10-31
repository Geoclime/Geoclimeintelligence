import { Popup } from "react-map-gl/mapbox";
import type { PlaceOnMap } from "../../types/map-layer.types";
import { describeKind } from "../../utils/facility-kinds";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { CoordinatesLink } from "./LocationSummary";

interface SavedPlacePopupProps {
  place: PlaceOnMap;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/** A place an administrator saved by hand, opened by clicking its dot: what it is, the note, and Edit and Delete. */
export function SavedPlacePopup({ place, onEdit, onDelete, onClose }: SavedPlacePopupProps) {
  return (
    <Popup longitude={place.point[0]} latitude={place.point[1]} anchor="bottom" offset={12} maxWidth="280px" closeOnClick={false} onClose={onClose} className="admin-unit-popup">
      <div className="saved-place" data-cy="saved-place">
        <p className="location-summary__title" data-cy="saved-place-name">
          {place.name ?? describeKind(place.osmClass)}
        </p>
        <p className="saved-place__kind">{describeKind(place.osmClass)} · saved by an administrator</p>
        <CoordinatesLink point={place.point} />
        {place.note && (
          <p className="saved-place__note" data-cy="saved-place-note">
            {place.note}
          </p>
        )}
        <div className="saved-place__actions">
          <Button variant="secondary" size="sm" icon={<Icon name="edit" size={14} />} onClick={onEdit} data-cy="edit-place">
            Edit
          </Button>
          <Button variant="danger" size="sm" icon={<Icon name="trash" size={14} />} onClick={onDelete} data-cy="delete-place">
            Delete
          </Button>
        </div>
      </div>
    </Popup>
  );
}
