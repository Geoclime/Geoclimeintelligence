import { useCallback, useState } from "react";
import { QUERY_KEYS, invalidateQueries } from "../cache/queryClient";
import { deleteHouseholdPhoto, fetchHouseholdPhotoFile, fetchHouseholdPhotos, uploadHouseholdPhoto } from "../endpoints/household.endpoints";
import { errorMessage } from "../transport/api-error";
import type { HouseholdPhoto } from "../types/household.types";
import type { PendingPhoto } from "../types/photo.types";
import { useFileUrl } from "./useFileUrl";
import { useLoader } from "./useLoader";
import { useToast } from "./useToast";

/** The photos of one home. `householdId` null = nothing is asked (it has none, or they aren't the viewer's to see). */
export function useHouseholdPhotos(householdId: string | null) {
  const key = householdId ? [...QUERY_KEYS.photos, "household", householdId] : null;
  const { data, loading } = useLoader<HouseholdPhoto[]>(key, async () => (await fetchHouseholdPhotos(householdId!)).data ?? []);
  return { photos: data ?? ([] as HouseholdPhoto[]), loading };
}

/** One photo of a home as a local URL for <img> (the file needs the sign-in token, so it is fetched through the API). */
export function useHouseholdPhotoFile(householdId: string, photoId: string) {
  return useFileUrl(photoId, () => fetchHouseholdPhotoFile(householdId, photoId));
}

/**
 * Sends a home's photos one at a time after the household has been saved, so a weak signal never costs
 * the household itself. Says how it went; a photo that didn't go can be added again from its popup.
 */
export function useHouseholdPhotoUploads() {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const upload = useCallback(
    async (householdId: string, photos: readonly PendingPhoto[]): Promise<number> => {
      if (photos.length === 0) return 0;
      setBusy(true);
      let sent = 0;
      let lastError: string | null = null;
      for (const photo of photos) {
        try {
          await uploadHouseholdPhoto(householdId, photo.blob);
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
          message: `${failed} ${failed === 1 ? "photo" : "photos"} didn't upload${lastError ? ` (${lastError})` : ""}. Open the household on the map to add ${failed === 1 ? "it" : "them"} again.`,
        });
      } else {
        showToast({ type: "success", message: `${sent} ${sent === 1 ? "photo" : "photos"} added.` });
      }
      return sent;
    },
    [showToast],
  );

  const remove = useCallback(
    async (householdId: string, photoId: string) => {
      try {
        await deleteHouseholdPhoto(householdId, photoId);
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
