import { useId, useState } from "react";
import type { HouseholdFormTarget } from "../../hooks/useHouseholds";
import { errorMessage } from "../../transport/api-error";
import { formatCoordinates } from "../../utils/formatCoordinates";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { Modal } from "../shared/Modal";
import { TextAreaField } from "../shared/TextAreaField";
import { TextField } from "../shared/TextField";
import "../users/users.css";

interface HouseholdFormDialogProps {
  target: HouseholdFormTarget;
  onClose: () => void;
  /** Saves the form. Rejects with an ApiError so the form can show why. */
  onSubmit: (values: { label: string; note: string; people: string }) => Promise<unknown>;
}

/**
 * Marking a home on the map: a name for it, how many live there, and anything a rescuer should know.
 * Private: only its owner and staff ever see it. Render it with a fresh `key` each time it opens.
 */
export function HouseholdFormDialog({ target, onClose, onSubmit }: HouseholdFormDialogProps) {
  const formId = useId();
  const editing = target.mode === "edit";
  const [label, setLabel] = useState(editing ? target.household.label : "Home");
  const [people, setPeople] = useState(editing && target.household.people ? String(target.household.people) : "");
  const [note, setNote] = useState(editing ? (target.household.note ?? "") : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!label.trim()) return setError("Give it a name, like “Home”.");
    if (people.trim() && !(/^\d+$/.test(people.trim()) && Number(people) >= 1 && Number(people) <= 200)) return setError("How many people live there: a number from 1 to 200, or leave it blank.");
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ label, note, people });
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
        <TextField label="How many people live here? (optional)" inputMode="numeric" value={people} onChange={(event) => setPeople(event.target.value)} hint="Helps responders plan a rescue." data-cy="household-people" />
        <TextAreaField
          label="Anything responders should know? (optional)"
          rows={2}
          maxLength={300}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          hint="Someone who can't walk far, a ground-floor flat, a landmark to find it."
          data-cy="household-note"
        />
      </form>
    </Modal>
  );
}
