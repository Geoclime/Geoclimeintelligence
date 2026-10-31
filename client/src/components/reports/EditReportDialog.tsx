import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { useGeolocation } from "../../hooks/useGeolocation";
import type { BBox, LonLat } from "../../types/admin-unit.types";
import { WATER_DEPTHS, type FloodReport, type UpdateFloodReport } from "../../types/flood-report.types";
import { applySubmitError } from "../../utils/form-errors";
import { WATER_DEPTH_INFO } from "../../utils/water-depth";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { Modal } from "../shared/Modal";
import { SelectField } from "../shared/SelectField";
import { TextAreaField } from "../shared/TextAreaField";
import { TextField } from "../shared/TextField";
import { LocationPicker } from "./LocationPicker";
import { reportFormSchema, type ReportFormValues } from "./report-form.schema";
import "../users/users.css";
import "./reports.css";

interface EditReportDialogProps {
  report: FloodReport;
  onClose: () => void;
  /** Rejects with an ApiError so the form can show a 400's field errors. */
  onSave: (id: string, body: UpdateFloodReport) => Promise<FloodReport>;
  onSaved: (report: FloodReport) => void;
}

const around = ([lon, lat]: LonLat): BBox => [lon - 0.004, lat - 0.004, lon + 0.004, lat + 0.004];

/**
 * Edit a report that has not been published: where it is, the place name, how deep the water is,
 * and what you see. Photos, recordings and other files stay as sent (delete the report and send a
 * new one to change them). A rejected report that is saved goes back to the coordinators for
 * another look. Render it with a fresh `key` for each report.
 */
export function EditReportDialog({ report, onClose, onSave, onSaved }: EditReportDialogProps) {
  const formId = useId();
  const geolocation = useGeolocation();
  const [point, setPoint] = useState<LonLat>(report.point);
  const [focus, setFocus] = useState<BBox | null>(null);
  const rejected = report.status === "rejected";
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ReportFormValues>({
    resolver: zodResolver(reportFormSchema),
    mode: "onTouched",
    defaultValues: { locationName: report.locationName, waterDepth: report.waterDepth, description: report.description },
  });

  const locateMe = async () => {
    const position = await geolocation.request();
    if (!position) return;
    setPoint(position);
    setFocus(around(position));
  };

  const submit = handleSubmit(async (values) => {
    try {
      onSaved(await onSave(report.id, { point, locationName: values.locationName.trim(), waterDepth: values.waterDepth, description: values.description.trim() }));
    } catch (error) {
      applySubmitError(error, setError, ["locationName", "waterDepth", "description"]);
    }
  });

  return (
    <Modal
      open
      title="Edit your report"
      description="Change what you sent while it hasn't been published. A coordinator reviews the report before it appears on the public alert map."
      onClose={onClose}
      dismissible={!isSubmitting}
      dataCy="edit-report-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={isSubmitting} loadingLabel="Saving…" data-cy="save-report">
            {rejected ? "Save and send for review again" : "Save changes"}
          </Button>
        </>
      }
    >
      <form id={formId} className="access-form" onSubmit={submit} noValidate>
        {rejected && (
          <Callout tone="warning" dataCy="edit-report-rejected">
            A coordinator didn't publish this report{report.reviewNote ? `: “${report.reviewNote}”.` : "."} Saving your changes sends it back for review.
          </Callout>
        )}
        {errors.root?.server && (
          <Callout tone="danger" dataCy="form-error">
            {errors.root.server.message}
          </Callout>
        )}
        <LocationPicker point={point} focus={focus} onPick={setPoint} onLocate={() => void locateMe()} locating={geolocation.locating} error={geolocation.error} />
        <TextField
          label="Place name"
          hint="A street, landmark or community people would recognise. If you moved the pin, check the name still fits."
          error={errors.locationName?.message}
          data-cy="report-location-name"
          {...register("locationName")}
        />
        <SelectField label="Water depth" error={errors.waterDepth?.message} data-cy="report-depth" {...register("waterDepth")}>
          {WATER_DEPTHS.map((depth) => (
            <option key={depth} value={depth}>
              {WATER_DEPTH_INFO[depth].label}: {WATER_DEPTH_INFO[depth].description.toLowerCase()} ({WATER_DEPTH_INFO[depth].metres})
            </option>
          ))}
        </SelectField>
        <TextAreaField label="Describe what you see" rows={4} maxLength={2000} error={errors.description?.message} data-cy="report-description" {...register("description")} />
        {report.media.length > 0 && (
          <p className="field__hint" data-cy="edit-report-media-note">
            Your {report.media.length === 1 ? "attached file stays" : `${report.media.length} attached files stay`} as sent.
          </p>
        )}
      </form>
    </Modal>
  );
}
