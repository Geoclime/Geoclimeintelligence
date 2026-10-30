import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm, useWatch } from "react-hook-form";
import { ALERT_SEVERITIES, type FloodAlert, type NewAlertBody } from "../../types/alert.types";
import { SEVERITY_INFO } from "../../utils/alert-severity";
import { applySubmitError } from "../../utils/form-errors";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { Modal } from "../shared/Modal";
import { SelectField } from "../shared/SelectField";
import { TextAreaField } from "../shared/TextAreaField";
import { TextField } from "../shared/TextField";
import { alertFormSchema, DURATIONS, toAlertBody, type AlertFormValues } from "./alert-form.schema";
import { AreaPicker } from "./AreaPicker";
import "../users/users.css";
import "./alerts.css";

interface IssueAlertDialogProps {
  open: boolean;
  onClose: () => void;
  /** Rejects with an ApiError so the form can show a 400's field errors. */
  onIssue: (body: NewAlertBody) => Promise<FloodAlert>;
  onIssued: (alert: FloodAlert) => void;
}

const defaults = (): AlertFormValues => ({
  severity: "warning",
  title: "",
  message: "",
  actions: SEVERITY_INFO.warning.defaultActions.join("\n"),
  areaIds: [],
  durationHours: "24",
});

/**
 * Issue a flood alert: its level, the areas it covers, what is happening, what people should do,
 * and how long it lasts. It goes public (the landing page and alert map) the moment it is issued.
 * Render it with a fresh `key` each time it opens.
 */
export function IssueAlertDialog({ open, onClose, onIssue, onIssued }: IssueAlertDialogProps) {
  const formId = useId();
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    getFieldState,
    formState: { errors, isSubmitting },
  } = useForm<AlertFormValues>({ resolver: zodResolver(alertFormSchema), defaultValues: defaults() });
  const severity = useWatch({ control, name: "severity" });
  const areaIds = useWatch({ control, name: "areaIds" });

  // Until the issuer edits the actions, they follow the chosen level's suggestions.
  const severityField = register("severity", {
    onChange: (event: { target: { value: keyof typeof SEVERITY_INFO } }) => {
      if (!getFieldState("actions").isDirty) setValue("actions", SEVERITY_INFO[event.target.value].defaultActions.join("\n"));
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      onIssued(await onIssue(toAlertBody(values)));
    } catch (error) {
      applySubmitError(error, setError, ["severity", "title", "message", "actions", "areaIds"]);
    }
  });

  return (
    <Modal
      open={open}
      title="Issue a flood alert"
      description="It is public as soon as it is issued: on the home page, the alert map and every signed-in screen."
      onClose={onClose}
      dismissible={!isSubmitting}
      dataCy="issue-alert-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant={severity === "severe" ? "danger" : "primary"} loading={isSubmitting} loadingLabel="Issuing…" data-cy="issue-alert">
            Issue {SEVERITY_INFO[severity].label.toLowerCase()}
          </Button>
        </>
      }
    >
      <form id={formId} className="access-form" onSubmit={onSubmit} noValidate>
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
        <AreaPicker value={areaIds} onChange={(ids) => setValue("areaIds", ids, { shouldValidate: true, shouldDirty: true })} error={errors.areaIds?.message} />
        <TextField label="Title" placeholder="e.g. River Bonny rising at Port Harcourt" error={errors.title?.message} data-cy="alert-title" {...register("title")} />
        <TextAreaField label="What is happening" rows={3} maxLength={2000} error={errors.message?.message} data-cy="alert-message" {...register("message")} />
        <TextAreaField label="What people should do (one per line)" rows={4} error={errors.actions?.message} data-cy="alert-actions" {...register("actions")} />
        <SelectField label="Lasts for" {...register("durationHours")} data-cy="alert-duration">
          {DURATIONS.map((d) => (
            <option key={d.hours} value={d.hours}>
              {d.label}
            </option>
          ))}
        </SelectField>
      </form>
    </Modal>
  );
}
