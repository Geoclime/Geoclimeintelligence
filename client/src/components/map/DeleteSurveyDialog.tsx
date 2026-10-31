import { useState } from "react";
import type { SelectedSurvey } from "../../types/field-survey.types";
import { drainTitle } from "../../utils/field-survey";
import { formatArea } from "../../utils/survey-geometry";
import { Button } from "../shared/Button";
import { Modal } from "../shared/Modal";

interface DeleteSurveyDialogProps {
  /** The flood or drain to delete; null keeps the dialog closed. */
  selected: SelectedSurvey | null;
  onClose: () => void;
  /** Deletes it. Resolves false when it failed, after telling the user why. */
  onConfirm: () => Promise<boolean>;
}

/** Asks before deleting a recorded flood or drain for good. A failure is shown as a message and the dialog stays open. */
export function DeleteSurveyDialog({ selected, onClose, onConfirm }: DeleteSurveyDialogProps) {
  const [busy, setBusy] = useState(false);
  const what = selected ? (selected.type === "flood" ? `The ${formatArea(selected.properties.areaM2)} flood` : `“${drainTitle(selected.properties)}”`) : "";

  const confirm = async () => {
    setBusy(true);
    await onConfirm();
    setBusy(false);
  };

  return (
    <Modal
      open={selected !== null}
      title={selected?.type === "flood" ? "Delete this flood?" : "Delete this drainage?"}
      description={selected ? `${what} will be removed from the map for good. ${selected.type === "flood" ? "If the water has only gone down, mark it as receded instead and keep the record." : "If it was only cleared, check it again instead and keep the record."}` : undefined}
      onClose={onClose}
      dismissible={!busy}
      dataCy="delete-survey-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={busy} loadingLabel="Deleting…" data-cy="confirm-delete-survey">
            Delete
          </Button>
        </>
      }
    />
  );
}
