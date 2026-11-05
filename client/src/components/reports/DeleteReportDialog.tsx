import { useState } from "react";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../transport/api-error";
import type { FloodReport } from "../../types/flood-report.types";
import { Button } from "../shared/Button";
import { Modal } from "../shared/Modal";

interface DeleteReportDialogProps {
  /** The report to delete; null keeps the dialog closed. */
  report: FloodReport | null;
  /** A coordinator deleting someone else's report: the sender is told, and a published one leaves the public map. */
  byReviewer?: boolean;
  onClose: () => void;
  onConfirm: (report: FloodReport) => Promise<void>;
}

/** Asks before deleting a report for good. A failure is shown as a message and the dialog stays open. */
export function DeleteReportDialog({ report, byReviewer = false, onClose, onConfirm }: DeleteReportDialogProps) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!report) return;
    setBusy(true);
    try {
      await onConfirm(report);
      showToast({ type: "info", message: `The report from “${report.locationName}” was deleted.` });
      onClose();
    } catch (failure) {
      showToast({ type: "error", message: errorMessage(failure) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={report !== null}
      title="Delete this report?"
      description={
        report ? (
          byReviewer ? (
            <>
              The report from “{report.locationName}” will be removed for good, with its photos and recordings{report.status === "published" ? ", and from the public alert map" : ""}. The
              person who sent it will be told it was removed.
            </>
          ) : (
            <>The report from “{report.locationName}” will be removed for good, with its photos and recordings. Coordinators will no longer see it.</>
          )
        ) : undefined
      }
      onClose={onClose}
      dismissible={!busy}
      dataCy="delete-report-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Keep it
          </Button>
          <Button variant="danger" onClick={() => void confirm()} loading={busy} loadingLabel="Deleting…" data-cy="confirm-delete-report">
            Delete report
          </Button>
        </>
      }
    />
  );
}
