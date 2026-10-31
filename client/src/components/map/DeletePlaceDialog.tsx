import { useState } from "react";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../transport/api-error";
import type { PlaceOnMap } from "../../types/map-layer.types";
import { describeKind } from "../../utils/facility-kinds";
import { Button } from "../shared/Button";
import { Modal } from "../shared/Modal";

interface DeletePlaceDialogProps {
  /** The place to delete; null keeps the dialog closed. */
  place: PlaceOnMap | null;
  onClose: () => void;
  onConfirm: (place: PlaceOnMap) => Promise<void>;
}

/** Asks before deleting a saved place for good. A failure is shown as a message and the dialog stays open. */
export function DeletePlaceDialog({ place, onClose, onConfirm }: DeletePlaceDialogProps) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!place) return;
    setBusy(true);
    try {
      await onConfirm(place);
      showToast({ type: "info", message: `“${place.name ?? describeKind(place.osmClass)}” was deleted.` });
    } catch (failure) {
      showToast({ type: "error", message: errorMessage(failure) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={place !== null}
      title="Delete this place?"
      description={
        place ? (
          <>
            “{place.name ?? describeKind(place.osmClass)}” will be removed from the map for good. You can save it again later by clicking its spot.
          </>
        ) : undefined
      }
      onClose={onClose}
      dismissible={!busy}
      dataCy="delete-place-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={busy} loadingLabel="Deleting…" data-cy="confirm-delete-place">
            Delete place
          </Button>
        </>
      }
    />
  );
}
