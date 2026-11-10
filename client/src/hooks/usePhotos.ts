import { useCallback, useState } from "react";
import { QUERY_KEYS, invalidateQueries } from "../cache/queryClient";
import { deletePhoto, fetchPhotoFile, fetchPhotos, uploadPhoto } from "../endpoints/photo.endpoints";
import { errorMessage } from "../transport/api-error";
import type { PendingPhoto, Photo, PhotoSubject } from "../types/photo.types";
import { useFileUrl } from "./useFileUrl";
import { useLoader } from "./useLoader";
import { useToast } from "./useToast";

/** The photos of one flood, drain, inspection or place. `subject` null (or not allowed) = nothing is asked. */
export function usePhotos(subject: PhotoSubject | null, enabled: boolean) {
  const key = subject && enabled ? [...QUERY_KEYS.photos, subject.type, subject.id] : null;
  const { data, ...state } = useLoader(key, async () => (await fetchPhotos(subject!)).data ?? []);
  return { photos: data ?? ([] as Photo[]), ...state };
}

/**
 * Sends photos one at a time after what they belong to has been saved, so a weak signal never costs the
 * record itself. Says how it went; a photo that didn't go can be added again from the popup.
 */
export function usePhotoUploads() {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const upload = useCallback(
    async (subject: PhotoSubject, photos: readonly PendingPhoto[]): Promise<number> => {
      if (photos.length === 0) return 0;
      setBusy(true);
      let sent = 0;
      let lastError: string | null = null;
      for (const photo of photos) {
        try {
          await uploadPhoto(subject, photo);
          sent += 1;
        } catch (failure) {
          lastError = errorMessage(failure);
        }
      }
      setBusy(false);
      invalidateQueries(QUERY_KEYS.photos);
      if (sent < photos.length) {
        const failed = photos.length - sent;
        showToast({
          type: "error",
          message: `${failed} ${failed === 1 ? "photo" : "photos"} didn't upload${lastError ? ` (${lastError})` : ""}. Open it on the map to add ${failed === 1 ? "it" : "them"} again.`,
        });
      } else {
        showToast({ type: "success", message: `${sent} ${sent === 1 ? "photo" : "photos"} added.` });
      }
      return sent;
    },
    [showToast],
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await deletePhoto(id);
        invalidateQueries(QUERY_KEYS.photos);
        showToast({ type: "success", message: "Photo deleted." });
        return true;
      } catch (failure) {
        showToast({ type: "error", message: errorMessage(failure) });
        return false;
      }
    },
    [showToast],
  );

  return { upload, remove, busy };
}

/**
 * One photo's file as a local URL for <img>. It needs the sign-in token, so it is fetched through the
 * API client and shown from memory; the URL is released when the component goes away.
 */
export function usePhotoFile(id: string) {
  return useFileUrl(id, () => fetchPhotoFile(id));
}
