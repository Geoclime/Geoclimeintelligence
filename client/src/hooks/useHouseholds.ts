import { useCallback, useState } from "react";
import { invalidateQueries } from "../cache/queryClient";
import { deleteHousehold, fetchHouseholdGeoJson, saveHousehold, updateHousehold } from "../endpoints/household.endpoints";
import { errorMessage } from "../transport/api-error";
import type { BBox, LonLat } from "../types/admin-unit.types";
import type { Household, HouseholdFormValues, HouseholdOnMap, HouseholdPatch } from "../types/household.types";
import type { PendingPhoto } from "../types/photo.types";
import { useDebounce } from "./useDebounce";
import { useHouseholdPhotoUploads } from "./useHouseholdPhotos";
import { useLoader } from "./useLoader";
import { useToast } from "./useToast";

/**
 * The households layer for the visible area: the viewer's own, or everyone's for staff (the server
 * decides). Fetched 300 ms after the map stops moving; never cached, since it changes as people add homes.
 * `within` (an LGA or ward id) keeps only the households inside that area, for the map on its page.
 */
export function useHouseholdLayer(bbox: BBox | null, enabled: boolean, refreshKey: number, within?: string) {
  const view = useDebounce(enabled ? bbox : null, 300);
  const key = view ? ["households", view.map((n) => n.toFixed(4)).join(","), refreshKey, within ?? ""] : null;
  const { data, loading, error } = useLoader(key, async () => (await fetchHouseholdGeoJson(view!, within)).data ?? null);
  return { data: enabled ? (data ?? null) : null, loading: enabled && loading, error: enabled ? error : null };
}

/** What the form is open for: a new household at a spot, or one of the viewer's own. */
export type HouseholdFormTarget = { mode: "create"; point: LonLat; where: string } | { mode: "edit"; household: HouseholdOnMap };

/**
 * The viewer's households on the map: the one open in a popup, the form to add or change one, and
 * removing one. `onChanged` runs after each, so the layer is fetched again.
 */
export function useHouseholds(onChanged: () => void) {
  const { showToast } = useToast();
  const photoUploads = useHouseholdPhotoUploads();
  const [selected, setSelected] = useState<HouseholdOnMap | null>(null);
  const [form, setForm] = useState<HouseholdFormTarget | null>(null);
  const [formKey, setFormKey] = useState(0);

  const openCreate = useCallback((point: LonLat, where: string) => {
    setFormKey((value) => value + 1);
    setForm({ mode: "create", point, where });
  }, []);
  const openEdit = useCallback((household: HouseholdOnMap) => {
    setFormKey((value) => value + 1);
    setForm({ mode: "edit", household });
  }, []);

  /** Saves the form. Rejects with an ApiError so the form can show why. */
  const submit = useCallback(
    async (values: HouseholdFormValues, photos: PendingPhoto[] = []): Promise<Household | null> => {
      if (!form) return null;
      const people = values.people.trim() ? Number(values.people) : undefined;
      const { data } =
        form.mode === "create"
          ? await saveHousehold({
              label: values.label.trim(),
              note: values.note.trim() || undefined,
              people,
              homeType: values.homeType || undefined,
              phone: values.phone || undefined,
              longitude: form.point[0],
              latitude: form.point[1],
            })
          : await updateHousehold(form.household.id, {
              label: values.label.trim(),
              note: values.note.trim(),
              people: people ?? null,
              homeType: values.homeType || null,
              phone: values.phone,
            } satisfies HouseholdPatch);
      // The household is saved first; its photos follow, so a weak signal never costs the household.
      if (form.mode === "create" && data) void photoUploads.upload(data.id, photos);
      setForm(null);
      setSelected(null);
      invalidateQueries(["households"]);
      onChanged();
      showToast({
        type: "success",
        message: form.mode === "create" ? "Household saved. You'll be told about floods and alerts there." : "Household updated.",
      });
      return data ?? null;
    },
    [form, onChanged, photoUploads, showToast],
  );

  const remove = useCallback(
    async (household: HouseholdOnMap) => {
      try {
        await deleteHousehold(household.id);
        setSelected(null);
        invalidateQueries(["households"]);
        onChanged();
        showToast({ type: "success", message: `Removed “${household.label}”.` });
      } catch (failure) {
        showToast({ type: "error", message: errorMessage(failure) });
      }
    },
    [onChanged, showToast],
  );

  return {
    selected,
    select: setSelected,
    closeSelected: useCallback(() => setSelected(null), []),
    form,
    formKey,
    openCreate,
    openEdit,
    closeForm: useCallback(() => setForm(null), []),
    submit,
    remove,
  };
}
