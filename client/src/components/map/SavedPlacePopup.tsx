import type { ReactNode } from "react";
import { Popup } from "react-map-gl/mapbox";
import type { PlaceOnMap } from "../../types/map-layer.types";
import { describeKind } from "../../utils/facility-kinds";
import { formatPhone } from "../../utils/phone";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { CoordinatesLink } from "./LocationSummary";

interface SavedPlacePopupProps {
  place: PlaceOnMap;
  /** Offered only where the viewer may change it: an administrator, on a place saved by hand. */
  onEdit?: () => void;
  onDelete?: () => void;
  onClose: () => void;
  /** Anything more to show, such as the place's photos. */
  children?: ReactNode;
}

/**
 * A facility, opened by clicking its dot: what it is, where it came from, its note, and (for an
 * administrator, on a place saved by hand) Edit and Delete. Imported facilities belong to their source,
 * so they are read-only for everyone.
 */
export function SavedPlacePopup({ place, onEdit, onDelete, onClose, children }: SavedPlacePopupProps) {
  const savedByHand = (place.origin ?? "manual") === "manual";
  return (
    <Popup longitude={place.point[0]} latitude={place.point[1]} offset={12} maxWidth="min(300px, calc(100vw - 2rem))" closeOnClick={false} onClose={onClose} className="admin-unit-popup">
      <div className="saved-place" data-cy={savedByHand ? "saved-place" : "facility-popup"}>
        <p className="location-summary__title" data-cy="saved-place-name">
          {place.name ?? describeKind(place.osmClass)}
        </p>
        <p className="saved-place__kind">
          {describeKind(place.osmClass)} · {savedByHand ? "saved by an administrator" : "from OpenStreetMap"}
        </p>
        <CoordinatesLink point={place.point} />
        {place.phone && (
          <p className="saved-place__phone" data-cy="saved-place-phone">
            <Icon name="phone" size={14} /> <a href={`tel:${place.phone}`}>{formatPhone(place.phone)}</a>
          </p>
        )}
        {place.note && (
          <p className="saved-place__note" data-cy="saved-place-note">
            {place.note}
          </p>
        )}
        {children}
        {(onEdit || onDelete) && (
          <div className="saved-place__actions">
            {onEdit && (
              <Button variant="secondary" size="sm" icon={<Icon name="edit" size={14} />} onClick={onEdit} data-cy="edit-place">
                Edit
              </Button>
            )}
            {onDelete && (
              <Button variant="danger" size="sm" icon={<Icon name="trash" size={14} />} onClick={onDelete} data-cy="delete-place">
                Delete
              </Button>
            )}
          </div>
        )}
      </div>
    </Popup>
  );
}
