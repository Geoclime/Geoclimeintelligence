import { useState } from "react";
import { usePhotoFile } from "../../hooks/usePhotos";
import type { Photo } from "../../types/photo.types";
import { formatDateTime } from "../../utils/formatDate";
import { formatDistance } from "../../utils/geo-distance";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { Modal } from "../shared/Modal";
import { Spinner } from "../shared/Spinner";
import "./photos.css";

interface PhotoGalleryProps {
  photos: readonly Photo[];
  /** Whether the viewer may delete this one: they added it, or they may delete anyone's. */
  canDelete?: (photo: Photo) => boolean;
  onDelete?: (photo: Photo) => Promise<boolean>;
  /** Whose photos these are, for the captions: "the drain". */
  of: string;
}

function Thumb({ photo, onOpen, of }: { photo: Photo; onOpen: () => void; of: string }) {
  const file = usePhotoFile(photo.id);
  return (
    <button type="button" className="photo-gallery__thumb" onClick={onOpen} aria-label={`Open the photo of ${of}${photo.caption ? `: ${photo.caption}` : ""}`} data-cy="photo-thumb">
      {file.url ? <img src={file.url} alt="" /> : file.failed ? <Icon name="alert" size={16} /> : <Spinner size="sm" decorative />}
    </button>
  );
}

function FullPhoto({ photo, of }: { photo: Photo; of: string }) {
  const file = usePhotoFile(photo.id);
  if (file.failed) return <p className="photo-gallery__status">This photo couldn't be loaded.</p>;
  if (!file.url) return <p className="photo-gallery__status"><Spinner size="sm" decorative /> Loading the photo…</p>;
  return <img className="photo-gallery__full" src={file.url} alt={photo.caption ?? `Photo of ${of}`} />;
}

/**
 * The photos on a flood, drain, inspection or place: small thumbnails, each opening full size with who
 * took it, when, and how far from the thing the phone was. Staff only (photos.view): the caller decides.
 */
export function PhotoGallery({ photos, canDelete, onDelete, of }: PhotoGalleryProps) {
  const [open, setOpen] = useState<Photo | null>(null);
  const [busy, setBusy] = useState(false);
  if (photos.length === 0) return null;

  const remove = async () => {
    if (!open || !onDelete) return;
    setBusy(true);
    const done = await onDelete(open);
    setBusy(false);
    if (done) setOpen(null);
  };

  return (
    <>
      <div className="photo-gallery" data-cy="photo-gallery">
        {photos.map((photo) => (
          <Thumb key={photo.id} photo={photo} of={of} onOpen={() => setOpen(photo)} />
        ))}
      </div>
      <Modal
        open={open !== null}
        title={open?.caption ?? `Photo of ${of}`}
        description={
          open
            ? [
                `Taken ${formatDateTime(open.takenAt)}`,
                open.uploaderName ? `by ${open.uploaderName}` : null,
                open.distanceM !== null ? `${formatDistance(open.distanceM)} from it` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : undefined
        }
        onClose={() => setOpen(null)}
        dataCy="photo-viewer"
        footer={
          <>
            {open && canDelete?.(open) && onDelete && (
              <Button variant="danger" icon={<Icon name="trash" size={14} />} loading={busy} loadingLabel="Deleting…" onClick={() => void remove()} data-cy="delete-photo">
                Delete photo
              </Button>
            )}
            <Button variant="secondary" onClick={() => setOpen(null)}>
              Close
            </Button>
          </>
        }
      >
        {open && <FullPhoto photo={open} of={of} />}
      </Modal>
    </>
  );
}
