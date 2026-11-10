import { useState } from "react";
import { useHouseholdPhotoFile, useHouseholdPhotos, useHouseholdPhotoUploads } from "../../hooks/useHouseholdPhotos";
import type { HouseholdOnMap, HouseholdPhoto } from "../../types/household.types";
import type { PendingPhoto } from "../../types/photo.types";
import { formatDateTime } from "../../utils/formatDate";
import { HOUSEHOLD_PHOTO_NOTE, MAX_HOUSEHOLD_PHOTOS } from "../../utils/household-details";
import { PhotoPicker } from "../photos/PhotoPicker";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { Modal } from "../shared/Modal";
import { Spinner } from "../shared/Spinner";
import "../photos/photos.css";

function Thumb({ householdId, photo, onOpen }: { householdId: string; photo: HouseholdPhoto; onOpen: () => void }) {
  const file = useHouseholdPhotoFile(householdId, photo.id);
  return (
    <button type="button" className="photo-gallery__thumb" onClick={onOpen} aria-label="Open the photo of the home" data-cy="household-photo-thumb">
      {file.url ? <img src={file.url} alt="" /> : file.failed ? <Icon name="alert" size={16} /> : <Spinner size="sm" decorative />}
    </button>
  );
}

function FullPhoto({ householdId, photo }: { householdId: string; photo: HouseholdPhoto }) {
  const file = useHouseholdPhotoFile(householdId, photo.id);
  if (file.failed) return <p className="photo-gallery__status">This photo couldn't be loaded.</p>;
  if (!file.url) return <p className="photo-gallery__status"><Spinner size="sm" decorative /> Loading the photo…</p>;
  return <img className="photo-gallery__full" src={file.url} alt="Photo of the home" />;
}

/**
 * The photos in a household's popup: thumbnails that open full size, for its owner and for staff, who are
 * the only people who can reach the household at all. The owner can add photos (up to three) and delete
 * them. Nothing is asked when someone else's home has none.
 */
export function HouseholdPhotos({ household }: { household: HouseholdOnMap }) {
  const wanted = household.mine || household.photoCount > 0;
  const { photos, loading } = useHouseholdPhotos(wanted ? household.id : null);
  const uploads = useHouseholdPhotoUploads();
  const [open, setOpen] = useState<HouseholdPhoto | null>(null);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [deleting, setDeleting] = useState(false);
  if (!wanted) return null;
  const room = MAX_HOUSEHOLD_PHOTOS - photos.length;

  const send = async () => {
    await uploads.upload(household.id, pending);
    setPending([]);
    setAdding(false);
  };
  const remove = async () => {
    if (!open) return;
    setDeleting(true);
    const done = await uploads.remove(household.id, open.id);
    setDeleting(false);
    if (done) setOpen(null);
  };

  return (
    <div className="photo-section" data-cy="household-photos">
      <p className="photo-section__title">
        <Icon name="camera" size={14} /> Photos {loading ? "" : `(${photos.length})`}
      </p>
      {photos.length > 0 && (
        <div className="photo-gallery">
          {photos.map((photo) => (
            <Thumb key={photo.id} householdId={household.id} photo={photo} onOpen={() => setOpen(photo)} />
          ))}
        </div>
      )}
      {household.mine && room > 0 && !adding && (
        <Button variant="ghost" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => setAdding(true)} data-cy="add-household-photos">
          Add photos
        </Button>
      )}
      {adding && (
        <>
          <PhotoPicker photos={pending} onChange={setPending} max={room} of="your home" privacyNote={HOUSEHOLD_PHOTO_NOTE} disabled={uploads.busy} />
          <div className="survey-popup__actions">
            <Button size="sm" disabled={pending.length === 0} loading={uploads.busy} loadingLabel="Uploading…" onClick={() => void send()} data-cy="upload-household-photos">
              Upload {pending.length > 0 ? pending.length : ""}
            </Button>
            <Button variant="ghost" size="sm" disabled={uploads.busy} onClick={() => (setAdding(false), setPending([]))}>
              Cancel
            </Button>
          </div>
        </>
      )}
      <Modal
        open={open !== null}
        title={`Photo of ${household.label}`}
        description={open ? `Added ${formatDateTime(open.createdAt)}` : undefined}
        onClose={() => setOpen(null)}
        dataCy="household-photo-viewer"
        footer={
          <>
            {open && household.mine && (
              <Button variant="danger" icon={<Icon name="trash" size={14} />} loading={deleting} loadingLabel="Deleting…" onClick={() => void remove()} data-cy="delete-household-photo">
                Delete photo
              </Button>
            )}
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Close
            </Button>
          </>
        }
      >
        {open && <FullPhoto householdId={household.id} photo={open} />}
      </Modal>
    </div>
  );
}
