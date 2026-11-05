import { useEffect, useId, useMemo, useState } from "react";
import type { PendingPhoto } from "../../types/photo.types";
import { compressImage } from "../../utils/compress-image";
import { quietFix } from "../../utils/quiet-fix";
import { Icon } from "../shared/Icon";
import { Spinner } from "../shared/Spinner";
import "./photos.css";

/** The one line every photo form carries: photos are seen by staff, and can show people and their homes. */
export const PHOTO_PRIVACY_NOTE = "Avoid faces and number plates. Photos are seen by staff only, never on the public map.";

interface PhotoPickerProps {
  photos: PendingPhoto[];
  onChange: (photos: PendingPhoto[]) => void;
  /** How many may be chosen. */
  max: number;
  /** What the photos are of, for screen readers: "the drain". */
  of: string;
  disabled?: boolean;
}

/**
 * Photos to send with a record, from the camera on a phone or from files elsewhere. Each is shrunk in the
 * browser before upload (utils/compress-image.ts), which also strips its embedded metadata and so its GPS
 * tag; where the phone was when the photo was added is asked separately, and only kept if it says within
 * a few seconds. Each photo can have a short caption.
 */
export function PhotoPicker({ photos, onChange, max, of, disabled = false }: PhotoPickerProps) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const previews = useMemo(() => photos.map((photo) => URL.createObjectURL(photo.blob)), [photos]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const room = max - photos.length;
    const [shrunk, at] = await Promise.all([Promise.all([...files].slice(0, room).map((file) => compressImage(file))), quietFix()]);
    const takenAt = new Date().toISOString();
    onChange([...photos, ...shrunk.map((blob) => ({ blob, caption: "", takenAt, at }))]);
    setBusy(false);
  };

  const setCaption = (index: number, caption: string) => onChange(photos.map((photo, i) => (i === index ? { ...photo, caption: caption.slice(0, 200) } : photo)));

  return (
    <div className="photo-picker" data-cy="survey-photo-picker">
      <p className="photo-picker__note">{PHOTO_PRIVACY_NOTE}</p>
      <div className="photo-picker__grid">
        {previews.map((url, index) => (
          <figure key={url} className="photo-picker__item">
            <img src={url} alt={`Photo ${index + 1} of ${of}`} />
            <button type="button" className="photo-picker__remove" onClick={() => onChange(photos.filter((_, i) => i !== index))} aria-label={`Remove photo ${index + 1}`} disabled={disabled}>
              <Icon name="close" size={14} />
            </button>
            <input
              className="photo-picker__caption"
              value={photos[index]?.caption ?? ""}
              onChange={(event) => setCaption(index, event.target.value)}
              placeholder="Caption (optional)"
              aria-label={`Caption for photo ${index + 1}`}
              maxLength={200}
              disabled={disabled}
            />
          </figure>
        ))}
        {photos.length < max && (
          <label htmlFor={inputId} className="photo-picker__add">
            {busy ? <Spinner size="sm" label="Preparing photo" /> : <Icon name="plus" size={20} />}
            <span>{photos.length === 0 ? "Take or add a photo" : "Add another"}</span>
            <input
              id={inputId}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/*"
              capture="environment"
              multiple
              className="visually-hidden"
              disabled={busy || disabled}
              onChange={(event) => {
                void add(event.target.files);
                event.target.value = "";
              }}
              data-cy="survey-photo-input"
            />
          </label>
        )}
      </div>
    </div>
  );
}
