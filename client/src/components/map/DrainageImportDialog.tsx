import { useId, useState } from "react";
import { useDrainageImport } from "../../hooks/useSurveyDetails";
import { errorMessage } from "../../transport/api-error";
import type { DrainageImportReport } from "../../types/field-survey.types";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { Modal } from "../shared/Modal";
import { TextField } from "../shared/TextField";
import "../users/users.css";

interface DrainageImportDialogProps {
  open: boolean;
  /** The country the plan covers; drains outside its mapped wards are left out. */
  countryCode: string | null;
  onClose: () => void;
  /** Called after drains were added, so the map can draw them. */
  onImported: () => void;
}

/**
 * Loads a drainage plan: a GeoJSON file of drains (lines) and culverts, outfalls, inlets and ponds (points),
 * from a ministry or consultant survey. The server matches each feature's kind and condition by their
 * usual names, files it under its ward, and leaves out anything it can't place, saying why. Loading the
 * same plan again adds nothing twice. A drain the plan gives no condition for is dated by the plan, so the
 * map draws it faded until someone checks it on the ground.
 */
export function DrainageImportDialog({ open, countryCode, onClose, onImported }: DrainageImportDialogProps) {
  const formId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [planDate, setPlanDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<DrainageImportReport | null>(null);
  const importPlan = useDrainageImport();

  const close = () => {
    setFile(null);
    setPlanDate("");
    setError(null);
    setReport(null);
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file || !countryCode || !/^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
      setError("Choose the plan's file and say when it was surveyed.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await importPlan({ file, countryCode, planDate });
      setReport(data);
      if (data && data.inserted > 0) onImported();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const rejected = report ? Object.entries(report.rejected) : [];

  return (
    <Modal
      open={open}
      title="Import a drainage plan"
      description="A GeoJSON file of drains and culverts. Each is filed under the ward where it starts."
      onClose={close}
      dismissible={!busy}
      dataCy="drainage-import-dialog"
      footer={
        report ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form={formId} loading={busy} loadingLabel="Importing…" data-cy="import-drainage">
              Import
            </Button>
          </>
        )
      }
    >
      {report ? (
        <div className="access-form" data-cy="drainage-import-report">
          <Callout tone={report.inserted > 0 ? "success" : "info"}>
            {report.inserted.toLocaleString("en")} of {report.featuresInFile.toLocaleString("en")} features added
            {report.alreadyPresent > 0 ? `, ${report.alreadyPresent.toLocaleString("en")} already there` : ""}.
          </Callout>
          {rejected.length > 0 && (
            <>
              <p>Left out:</p>
              <ul>
                {rejected.map(([reason, count]) => (
                  <li key={reason}>
                    {count.toLocaleString("en")} × {reason}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <form id={formId} className="access-form" onSubmit={(event) => void submit(event)} noValidate>
          {error && (
            <Callout tone="danger" dataCy="form-error">
              {error}
            </Callout>
          )}
          <label className="field">
            <span className="field__label">The plan (.geojson)</span>
            <input type="file" accept=".geojson,.json,application/geo+json,application/json" className="field__input" onChange={(event) => setFile(event.target.files?.[0] ?? null)} data-cy="drainage-plan-file" />
            <span className="field__hint">
              Each feature&apos;s <code>kind</code> (drain, covered drain, culvert, outfall, inlet, pond), and if known its <code>condition</code>, <code>name</code>,{" "}
              <code>width</code>, <code>depth</code>, <code>diameter</code>, <code>material</code>, <code>flow</code> and an <code>id</code>.
            </span>
          </label>
          <TextField label="When was the plan surveyed?" type="date" value={planDate} onChange={(event) => setPlanDate(event.target.value)} hint="The “last checked” date of every drain the plan doesn't date." data-cy="drainage-plan-date" />
        </form>
      )}
    </Modal>
  );
}
