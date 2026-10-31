import { useCallback, useState } from "react";
import { deletePlace, savePlace, updatePlace } from "../endpoints/facility.endpoints";
import type { LonLat } from "../types/admin-unit.types";
import type { PlaceOnMap } from "../types/map-layer.types";
import { placeOnMapFrom } from "../utils/saved-places";
import { toNewPlaceBody, toUpdatePlaceBody, type PlaceFormValues } from "../components/map/place-form.schema";
import { useToast } from "./useToast";

/** What the form is open for: a new place at a point, or an existing one. */
export type PlaceFormTarget = { mode: "create"; point: LonLat; where: string } | { mode: "edit"; place: PlaceOnMap };

/**
 * An administrator's places on the map: the one open in a popup, the form to save or edit one, and
 * the confirmation before deleting one. `onChanged` runs after every save, edit or delete, so the
 * map can draw the facilities again.
 */
export function useSavedPlaces(onChanged: () => void) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState<PlaceOnMap | null>(null);
  const [form, setForm] = useState<PlaceFormTarget | null>(null);
  // A new key each time the form opens, so it starts from the right values instead of the last ones.
  const [formKey, setFormKey] = useState(0);
  const [removing, setRemoving] = useState<PlaceOnMap | null>(null);

  const openCreate = useCallback((point: LonLat, where: string) => {
    setFormKey((key) => key + 1);
    setForm({ mode: "create", point, where });
  }, []);

  const openEdit = useCallback((place: PlaceOnMap) => {
    setFormKey((key) => key + 1);
    setForm({ mode: "edit", place });
  }, []);

  /** Saves the form: a new place, or the changes to the one being edited. Rejects so the form can show why. */
  const submit = useCallback(
    async (values: PlaceFormValues) => {
      if (!form) throw new Error("No place is being edited");
      if (form.mode === "create") {
        const { data } = await savePlace(toNewPlaceBody(values, form.point));
        return data ? placeOnMapFrom(data) : null;
      }
      const { data } = await updatePlace(form.place.id, toUpdatePlaceBody(values));
      return data ? placeOnMapFrom(data) : null;
    },
    [form],
  );

  /** The form saved: say so, close it and the popup, and have the map draw the change. */
  const finished = useCallback(
    (place: PlaceOnMap | null) => {
      const created = form?.mode === "create";
      setForm(null);
      setSelected(null);
      onChanged();
      showToast({ type: "success", message: `${created ? "Saved" : "Updated"} “${place?.name ?? "the place"}”.` });
    },
    [form, onChanged, showToast],
  );

  const confirmRemove = useCallback(
    async (place: PlaceOnMap) => {
      await deletePlace(place.id);
      setRemoving(null);
      setSelected(null);
      onChanged();
    },
    [onChanged],
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
    finished,
    removing,
    askRemove: setRemoving,
    closeRemove: useCallback(() => setRemoving(null), []),
    confirmRemove,
  };
}
