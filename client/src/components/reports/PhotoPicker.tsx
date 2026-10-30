import { useEffect, useId, useMemo, useState } from "react";
import { compressImage } from "../../utils/compress-image";
import { Icon } from "../shared/Icon";
import { Spinner } from "../shared/Spinner";
import { MAX_PHOTOS } from "./report-form.schema";
import "./reports.css";

interface PhotoPickerProps {
  photos: Blob[];
  onChange: (photos: Blob[]) => void;
}

/**
 * Up to three photos, from the camera on a phone or from files elsewhere. Each is shrunk in the
 * browser before upload (utils/compress-image.ts), which also strips its embedded metadata.
 */
export function PhotoPicker({ photos, onChange }: PhotoPickerProps) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  // One object URL per photo, released when the photos change or the form goes away.
  const previews = useMemo(() => photos.map((photo) => URL.createObjectURL(photo)), [photos]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const room = MAX_PHOTOS - photos.length;
    const shrunk = await Promise.all([...files].slice(0, room).map((file) => compressImage(file)));
    onChange([...photos, ...shrunk]);
    setBusy(false);
  };

  return (
    <div className="media-picker" data-cy="photo-picker">
      {previews.map((url, index) => (
        <figure key={url} className="media-picker__thumb">
          <img src={url} alt={`Photo ${index + 1} of the flooding`} />
          <button type="button" onClick={() => onChange(photos.filter((_, i) => i !== index))} aria-label={`Remove photo ${index + 1}`}>
            <Icon name="close" size={14} />
          </button>
        </figure>
      ))}
      {photos.length < MAX_PHOTOS && (
        <label htmlFor={inputId} className="media-picker__add">
          {busy ? <Spinner size="sm" label="Preparing photo" /> : <Icon name="plus" size={20} />}
          <span>{photos.length === 0 ? "Take or add a photo" : "Add another"}</span>
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            capture="environment"
            multiple
            className="visually-hidden"
            disabled={busy}
            onChange={(event) => {
              void add(event.target.files);
              event.target.value = "";
            }}
            data-cy="photo-input"
          />
        </label>
      )}
    </div>
  );
}
