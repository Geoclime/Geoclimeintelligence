import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm, useWatch } from "react-hook-form";
import { ALERT_SEVERITIES, type FloodAlert } from "../../types/alert.types";
import { SEVERITY_INFO } from "../../utils/alert-severity";
import { applySubmitError } from "../../utils/form-errors";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { Modal } from "../shared/Modal";
import { SelectField } from "../shared/SelectField";
import { TextAreaField } from "../shared/TextAreaField";
import { TextField } from "../shared/TextField";
import { alertFormSchema, CUSTOM_DURATION, describeEnd, DURATIONS, KEEP_DURATION, MAX_CUSTOM_DAYS, type AlertFormValues } from "./alert-form.schema";
import { AreaPicker } from "./AreaPicker";
import "../users/users.css";
import "./alerts.css";

interface AlertFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** The alert being edited. Leave out to issue a new one. */
  alert?: FloodAlert;
  /** Saves the form. Rejects with an ApiError so the form can show a 400's field errors. */
  onSubmit: (values: AlertFormValues) => Promise<FloodAlert>;
  onDone: (alert: FloodAlert) => void;
}

const issueDefaults = (): AlertFormValues => ({
  severity: "warning",
  title: "",
  message: "",
  actions: SEVERITY_INFO.warning.defaultActions.join("\n"),
  areaIds: [],
  durationHours: "24",
  customDays: "7",
  notify: false,
});

const editDefaults = (alert: FloodAlert): AlertFormValues => ({
  severity: alert.severity,
  title: alert.title,
  message: alert.message,
  actions: alert.actions.join("\n"),
  areaIds: alert.areas.map((area) => area.id),
  durationHours: KEEP_DURATION,
  customDays: "7",
  notify: false,
});

/**
 * Issue a flood alert, or edit one that is still in force or scheduled: its level, the areas it
 * covers, what is happening, what people should do, and how long it lasts. It is public as soon as
 * it is saved. Editing starts from what was issued, and sends nobody a message unless the editor
 * ticks "Notify people about this change". Render it with a fresh `key` each time it opens.
 */
export function AlertFormDialog({ open, onClose, alert, onSubmit, onDone }: AlertFormDialogProps) {
  const formId = useId();
  const editing = alert !== undefined;
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    getFieldState,
    formState: { errors, isSubmitting },
  } = useForm<AlertFormValues>({ resolver: zodResolver(alertFormSchema), defaultValues: alert ? editDefaults(alert) : issueDefaults() });
  const severity = useWatch({ control, name: "severity" });
  const areaIds = useWatch({ control, name: "areaIds" });
  const durationHours = useWatch({ control, name: "durationHours" });
  const customDays = useWatch({ control, name: "customDays" });
  const ends = describeEnd({ durationHours, customDays }, { currentEnd: alert?.expiresAt });

  // A new alert's actions follow the chosen level's suggestions until the issuer edits them. An
  // edited alert keeps its own actions: changing the level must not overwrite what was written.
  const severityField = register("severity", {
    onChange: (event: { target: { value: keyof typeof SEVERITY_INFO } }) => {
      if (!editing && !getFieldState("actions").isDirty) setValue("actions", SEVERITY_INFO[event.target.value].defaultActions.join("\n"));
    },
  });

  const onFormSubmit = handleSubmit(async (values) => {
    try {
      onDone(await onSubmit(values));
    } catch (error) {
      applySubmitError(error, setError, ["severity", "title", "message", "actions", "areaIds"]);
    }
  });

  return (
    <Modal
      open={open}
      title={editing ? "Edit flood alert" : "Issue a flood alert"}
      description={
        editing
          ? "Changes show on the home page, the alert map and every signed-in screen as soon as you save."
          : "It is public as soon as it is issued: on the home page, the alert map and every signed-in screen."
      }
      onClose={onClose}
      dismissible={!isSubmitting}
      dataCy={editing ? "edit-alert-dialog" : "issue-alert-dialog"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant={severity === "severe" ? "danger" : "primary"}
            loading={isSubmitting}
            loadingLabel={editing ? "Saving…" : "Issuing…"}
            data-cy={editing ? "save-alert" : "issue-alert"}
          >
            {editing ? "Save changes" : `Issue ${SEVERITY_INFO[severity].label.toLowerCase()}`}
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
        <fieldset className="role-picker">
          <legend className="role-picker__legend">Alert level</legend>
          {ALERT_SEVERITIES.map((level) => (
            <label key={level} className={`role-picker__option severity-option severity-option--${level}`} data-cy={`severity-${level}`}>
              <input type="radio" value={level} {...severityField} />
              <span className="role-picker__text">
                <span className="role-picker__label">{SEVERITY_INFO[level].label}</span>
                <span className="role-picker__description">{SEVERITY_INFO[level].meaning}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <AreaPicker
          value={areaIds}
          knownAreas={alert?.areas}
          onChange={(ids) => setValue("areaIds", ids, { shouldValidate: true, shouldDirty: true })}
          error={errors.areaIds?.message}
        />
        <TextField label="Title" placeholder="e.g. River Bonny rising at Port Harcourt" error={errors.title?.message} data-cy="alert-title" {...register("title")} />
        <TextAreaField label="What is happening" rows={3} maxLength={2000} error={errors.message?.message} data-cy="alert-message" {...register("message")} />
        <TextAreaField label="What people should do (one per line)" rows={4} error={errors.actions?.message} data-cy="alert-actions" {...register("actions")} />
        <SelectField
          label={editing ? "Ends" : "Lasts for"}
          hint={durationHours !== CUSTOM_DURATION && ends ? (durationHours === KEEP_DURATION ? `Stays as issued: ends ${ends}.` : `Ends ${ends}.`) : undefined}
          {...register("durationHours")}
          data-cy="alert-duration"
        >
          {editing && <option value={KEEP_DURATION}>Keep the end time as it is</option>}
          {DURATIONS.map((d) => (
            <option key={d.hours} value={d.hours}>
              {editing ? `${d.label} from now` : d.label}
            </option>
          ))}
          <option value={CUSTOM_DURATION}>Custom number of days…</option>
        </SelectField>
        {durationHours === CUSTOM_DURATION && (
          <TextField
            label="Number of days"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_CUSTOM_DAYS}
            step={1}
            hint={`Any whole number of days, 1 to ${MAX_CUSTOM_DAYS}.${ends ? ` Ends ${ends}.` : ""}`}
            error={errors.customDays?.message}
            data-cy="alert-custom-days"
            {...register("customDays")}
          />
        )}
        {editing && (
          <label className="alert-notify" data-cy="alert-notify">
            <input type="checkbox" {...register("notify")} />
            <span>
              <strong>Notify people about this change</strong>
              <span className="alert-notify__hint">
                Sends the updated alert to everyone it covers, in the app, by email and by push. Leave it off for a small correction, like a typo.
              </span>
            </span>
          </label>
        )}
      </form>
    </Modal>
  );
}
