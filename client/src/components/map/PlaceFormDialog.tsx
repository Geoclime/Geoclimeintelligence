import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { PlaceFormTarget } from "../../hooks/useSavedPlaces";
import type { PlaceOnMap } from "../../types/map-layer.types";
import type { PendingPhoto } from "../../types/photo.types";
import { PhotoPicker } from "../photos/PhotoPicker";
import { MAX_PHOTOS } from "../photos/PhotoSection";
import { applySubmitError } from "../../utils/form-errors";
import { formatCoordinates } from "../../utils/formatCoordinates";
import { describeKind, FACILITY_KIND_GROUPS, isPickableKind } from "../../utils/facility-kinds";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { Modal } from "../shared/Modal";
import { PhoneField } from "../shared/PhoneField";
import { SelectField } from "../shared/SelectField";
import { TextAreaField } from "../shared/TextAreaField";
import { TextField } from "../shared/TextField";
import { MAX_PLACE_NOTE_LENGTH, placeFormSchema, type PlaceFormValues } from "./place-form.schema";
import "../users/users.css";

interface PlaceFormDialogProps {
  target: PlaceFormTarget;
  onClose: () => void;
  /** Saves the form, then sends the photos. Rejects with an ApiError so the form can show why. */
  onSubmit: (values: PlaceFormValues, photos: PendingPhoto[]) => Promise<PlaceOnMap | null>;
  /** Whether this person may add photos (photos.add). */
  canAddPhotos?: boolean;
  onDone: (place: PlaceOnMap | null) => void;
}

const defaultsFor = (target: PlaceFormTarget): PlaceFormValues =>
  target.mode === "edit"
    ? { name: target.place.name ?? "", kind: target.place.osmClass, note: target.place.note ?? "", phone: target.place.phone ?? "" }
    : { name: "", kind: "", note: "", phone: "" };

/**
 * An administrator saving a place the import missed, or editing one saved before: its name, what
 * kind of place it is, an optional phone number and an optional note. The point is the spot they tapped and can't be moved
 * here. Render it with a fresh `key` each time it opens.
 */
export function PlaceFormDialog({ target, onClose, onSubmit, onDone, canAddPhotos = false }: PlaceFormDialogProps) {
  const formId = useId();
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const editing = target.mode === "edit";
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PlaceFormValues>({ resolver: zodResolver(placeFormSchema), defaultValues: defaultsFor(target) });

  const onFormSubmit = handleSubmit(async (values) => {
    try {
      onDone(await onSubmit(values, photos));
    } catch (error) {
      applySubmitError(error, setError, ["name", "kind", "note", "phone"]);
    }
  });

  // A class the picker doesn't list (only reachable by editing one saved straight through the API) stays selectable.
  const unlistedKind = target.mode === "edit" && !isPickableKind(target.place.osmClass) ? target.place.osmClass : null;

  return (
    <Modal
      open
      title={editing ? "Edit saved place" : "Save this place"}
      description={
        editing ? (
          "Changes show on the map straight away."
        ) : (
          <>
            Adds it to the Facilities layer at <strong>{target.where || formatCoordinates(target.point)}</strong>. Everyone who uses the map will see it.
          </>
        )
      }
      onClose={onClose}
      dismissible={!isSubmitting}
      dataCy="place-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={isSubmitting} loadingLabel="Saving…" data-cy="save-place">
            {editing ? "Save changes" : "Save place"}
          </Button>
        </>
      }
    >
      <form id={formId} className="access-form" onSubmit={onFormSubmit} noValidate>
        {errors.root?.server && (
          <Callout tone="danger" dataCy="form-error">
            {errors.root.server.message}
          </Callout>
        )}
        <TextField label="Name" placeholder="e.g. St. Mary's Hospital" autoComplete="off" error={errors.name?.message} data-cy="place-name" {...register("name")} />
        <SelectField label="What is it?" error={errors.kind?.message} data-cy="place-kind" {...register("kind")}>
          <option value="" disabled>
            Choose a kind of place…
          </option>
          {unlistedKind && <option value={unlistedKind}>{describeKind(unlistedKind)}</option>}
          {FACILITY_KIND_GROUPS.map((group) => (
            <optgroup key={group.type} label={group.label}>
              {group.kinds.map((kind) => (
                <option key={kind.value} value={kind.value}>
                  {kind.label}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
        <Controller
          control={control}
          name="phone"
          render={({ field, fieldState }) => (
            <PhoneField
              label="Phone number (optional)"
              hint="A number to call this place on. Shown to everyone who uses the map."
              value={field.value ?? ""}
              onChange={field.onChange}
              onBlur={field.onBlur}
              ref={field.ref}
              error={fieldState.error?.message}
              data-cy="place-phone"
            />
          )}
        />
        <TextAreaField
          label="Note (optional)"
          rows={3}
          maxLength={MAX_PLACE_NOTE_LENGTH}
          hint="Opening hours, a landmark, how you checked it. Anyone who can read the map data can see it."
          error={errors.note?.message}
          data-cy="place-note"
          {...register("note")}
        />
        {target.mode === "create" && <p className="access-form__note">{formatCoordinates(target.point)}</p>}
        {canAddPhotos && target.mode === "create" && (
          <fieldset className="role-picker">
            <legend className="role-picker__legend">Photos (optional)</legend>
            <PhotoPicker photos={photos} onChange={setPhotos} max={MAX_PHOTOS} of="the place" disabled={isSubmitting} />
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
