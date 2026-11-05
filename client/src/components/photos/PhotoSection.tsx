import { useState } from "react";
import { usePhotos, usePhotoUploads } from "../../hooks/usePhotos";
import type { PendingPhoto, PhotoSubject } from "../../types/photo.types";
import type { SurveyAbilities } from "../../utils/permissions";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { PhotoGallery } from "./PhotoGallery";
import { PhotoPicker } from "./PhotoPicker";
import "./photos.css";

/** Photos one thing may have. Mirrors MAX_PHOTOS_PER_SUBJECT on the server. */
export const MAX_PHOTOS = 5;

interface PhotoSectionProps {
  subject: PhotoSubject;
  abilities: SurveyAbilities;
  /** What the photos are of, for screen readers and captions: "the drain". */
  of: string;
  /** How many photos the map layer says it has, so nothing is asked when it has none and the viewer can't add. */
  knownCount?: number;
}

/**
 * The photos part of a flood's, drain's or place's popup: what has been taken (for staff who may see
 * photos), and, for those who may add them, a picker that sends them straight away.
 */
export function PhotoSection({ subject, abilities, of, knownCount }: PhotoSectionProps) {
  const ask = abilities.viewPhotos && (knownCount === undefined || knownCount > 0 || abilities.addPhotos);
  const { photos, loading } = usePhotos(subject, ask);
  const uploads = usePhotoUploads();
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState<PendingPhoto[]>([]);

  if (!abilities.viewPhotos && !abilities.addPhotos) return null;
  const room = MAX_PHOTOS - photos.length;

  const send = async () => {
    await uploads.upload(subject, pending);
    setPending([]);
    setAdding(false);
  };

  return (
    <div className="photo-section" data-cy="photo-section">
      {abilities.viewPhotos && (
        <>
          <p className="photo-section__title">
            <Icon name="camera" size={14} /> Photos {loading ? "" : `(${photos.length})`}
          </p>
          <PhotoGallery
            photos={photos}
            of={of}
            canDelete={(photo) => abilities.deleteAnyPhoto || photo.uploadedBy === abilities.userId}
            onDelete={(photo) => uploads.remove(photo.id)}
          />
        </>
      )}
      {abilities.addPhotos && room > 0 && !adding && (
        <Button variant="ghost" size="sm" icon={<Icon name="plus" size={14} />} onClick={() => setAdding(true)} data-cy="add-photos">
          Add photos
        </Button>
      )}
      {adding && (
        <>
          <PhotoPicker photos={pending} onChange={setPending} max={room} of={of} disabled={uploads.busy} />
          <div className="survey-popup__actions">
            <Button size="sm" disabled={pending.length === 0} loading={uploads.busy} loadingLabel="Uploading…" onClick={() => void send()} data-cy="upload-photos">
              Upload {pending.length > 0 ? pending.length : ""}
            </Button>
            <Button variant="ghost" size="sm" disabled={uploads.busy} onClick={() => (setAdding(false), setPending([]))}>
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
