import { useId, useState } from "react";
import type { HouseholdFormTarget } from "../../hooks/useHouseholds";
import { errorMessage } from "../../transport/api-error";
import type { HomeType, HouseholdFormValues } from "../../types/household.types";
import type { PendingPhoto } from "../../types/photo.types";
import { formatCoordinates } from "../../utils/formatCoordinates";
import { HOME_TYPE_OPTIONS, HOUSEHOLD_PHOTO_NOTE, MAX_HOUSEHOLD_PHOTOS } from "../../utils/household-details";
import { isValidPhone } from "../../utils/phone";
import { PhotoPicker } from "../photos/PhotoPicker";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { Modal } from "../shared/Modal";
import { PhoneField } from "../shared/PhoneField";
import { SelectField } from "../shared/SelectField";
import { TextAreaField } from "../shared/TextAreaField";
import { TextField } from "../shared/TextField";
import "../users/users.css";

interface HouseholdFormDialogProps {
  target: HouseholdFormTarget;
  onClose: () => void;
  /** Saves the form, then sends the photos. Rejects with an ApiError so the form can show why. */
  onSubmit: (values: HouseholdFormValues, photos: PendingPhoto[]) => Promise<unknown>;
}

/**
 * Marking a home on the map: a name for it, what kind of home it is, how many live there, a number
 * responders can call, anything a rescuer should know, and up to three photos (when adding; an existing
 * home's photos are managed from its popup). Private: only its owner and staff ever see any of it.
 * Render it with a fresh `key` each time it opens.
 */
export function HouseholdFormDialog({ target, onClose, onSubmit }: HouseholdFormDialogProps) {
  const formId = useId();
  const editing = target.mode === "edit";
  const [label, setLabel] = useState(editing ? target.household.label : "Home");
  const [homeType, setHomeType] = useState<HomeType | "">(editing ? (target.household.homeType ?? "") : "");
  const [people, setPeople] = useState(editing && target.household.people ? String(target.household.people) : "");
  const [phone, setPhone] = useState(editing ? (target.household.phone ?? "") : "");
  const [note, setNote] = useState(editing ? (target.household.note ?? "") : "");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!label.trim()) return setError("Give it a name, like “Home”.");
    if (people.trim() && !(/^\d+$/.test(people.trim()) && Number(people) >= 1 && Number(people) <= 200)) return setError("How many people live there: a number from 1 to 200, or leave it blank.");
    if (phone && !isValidPhone(phone)) return setError("Enter the full phone number after the country code, e.g. 803 123 4567, or leave it blank.");
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ label, note, people, homeType, phone }, photos);
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      title={editing ? "Edit your household" : "Mark your household here"}
      description={
        editing ? (
          "The spot can't be moved: remove it and mark it again instead."
        ) : (
          <>
            At <strong>{target.where || formatCoordinates(target.point)}</strong>. Only you and staff can see it. You&apos;ll be told when a flood alert covers this area, or a
            flood is recorded near it.
          </>
        )
      }
      onClose={onClose}
      dismissible={!busy}
      dataCy="household-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={busy} loadingLabel="Saving…" data-cy="save-household">
            {editing ? "Save changes" : "Save household"}
          </Button>
        </>
      }
    >
      <form id={formId} className="access-form" onSubmit={(event) => void submit(event)} noValidate>
        {error && (
          <Callout tone="danger" dataCy="form-error">
            {error}
          </Callout>
        )}
        <TextField label="Name" value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} hint="For you: “Home”, “Mum's house”, “The shop”." data-cy="household-label" />
        <SelectField label="What kind of home is it? (optional)" value={homeType} onChange={(event) => setHomeType(event.target.value as HomeType | "")} data-cy="household-home-type">
          <option value="">Choose a kind of home…</option>
          {HOME_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        <TextField label="How many people live here? (optional)" inputMode="numeric" value={people} onChange={(event) => setPeople(event.target.value)} hint="Helps responders plan a rescue." data-cy="household-people" />
        <PhoneField
          label="Phone number (optional)"
          value={phone}
          onChange={setPhone}
          hint="A number responders can call about this home. Only you and staff can see it."
          data-cy="household-phone"
        />
        <TextAreaField
          label="Anything responders should know? (optional)"
          rows={2}
          maxLength={300}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          hint="Someone who can't walk far, a ground-floor flat, a landmark to find it."
          data-cy="household-note"
        />
        {!editing && (
          <fieldset className="role-picker">
            <legend className="role-picker__legend">Photos (optional)</legend>
            <PhotoPicker photos={photos} onChange={setPhotos} max={MAX_HOUSEHOLD_PHOTOS} of="your home" privacyNote={HOUSEHOLD_PHOTO_NOTE} disabled={busy} />
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
