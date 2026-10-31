import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { DRAINAGE_CONDITIONS, type SurveyTarget } from "../../types/field-survey.types";
import { CONDITION_INFO, DRAINAGE_KIND_LABEL } from "../../utils/field-survey";
import { applySubmitError } from "../../utils/form-errors";
import { formatDistance } from "../../utils/geo-distance";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { Modal } from "../shared/Modal";
import { SelectField } from "../shared/SelectField";
import { TextAreaField } from "../shared/TextAreaField";
import { TextField } from "../shared/TextField";
import { drainFormSchema, kindsFor, MAX_SURVEY_NOTE_LENGTH, type DrainFormValues } from "./survey-form.schema";
import "../users/users.css";

interface DrainageFormDialogProps {
  /** A drain walked as a line, or one spot. It decides which kinds are offered. */
  target: Extract<SurveyTarget, "drain-line" | "drain-spot">;
  /** How far it was walked, for a line. */
  distanceM: number;
  onClose: () => void;
  /** Saves the drainage. Rejects with an ApiError so the form can show why. */
  onSubmit: (values: DrainFormValues) => Promise<void>;
}

/** The last step of recording drainage: what it is, what shape it is in, and its size. Render it with a fresh `key` each time it opens. */
export function DrainageFormDialog({ target, distanceM, onClose, onSubmit }: DrainageFormDialogProps) {
  const formId = useId();
  const kinds = kindsFor(target);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DrainFormValues>({
    resolver: zodResolver(drainFormSchema),
    // The condition has no default: guessing "clear" for a drain nobody looked at closely would be a false record.
    defaultValues: { kind: kinds[0], condition: "" as DrainFormValues["condition"], name: "", widthM: "", depthM: "", note: "" },
  });

  const onFormSubmit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (failure) {
      applySubmitError(failure, setError, ["kind", "condition", "name", "widthM", "depthM", "note"]);
    }
  });

  return (
    <Modal
      open
      title="Save this drainage"
      description={target === "drain-line" ? `A drain about ${formatDistance(distanceM)} long. The length is measured again on the server.` : "One spot: a culvert, outfall, inlet or pond."}
      onClose={onClose}
      dismissible={!isSubmitting}
      dataCy="drain-form-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Keep recording
          </Button>
          <Button type="submit" form={formId} loading={isSubmitting} loadingLabel="Saving…" data-cy="save-drain">
            Save drainage
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
        <SelectField label="What is it?" error={errors.kind?.message} data-cy="drain-kind" {...register("kind")}>
          {kinds.map((kind) => (
            <option key={kind} value={kind}>
              {DRAINAGE_KIND_LABEL[kind]}
            </option>
          ))}
        </SelectField>
        <fieldset className="role-picker">
          <legend className="role-picker__legend">What shape is it in?</legend>
          {DRAINAGE_CONDITIONS.map((condition) => (
            <label key={condition} className="role-picker__option" data-cy={`condition-${condition}`}>
              <input type="radio" value={condition} {...register("condition")} />
              <span className="role-picker__text">
                <span className="role-picker__label">{CONDITION_INFO[condition].label}</span>
                <span className="role-picker__description">{CONDITION_INFO[condition].meaning}</span>
              </span>
            </label>
          ))}
          {errors.condition && (
            <p className="field__error" data-cy="field-error">
              {errors.condition.message}
            </p>
          )}
        </fieldset>
        <TextField label="Name (optional)" placeholder="e.g. Aba Road drain" autoComplete="off" error={errors.name?.message} data-cy="drain-name" {...register("name")} />
        <TextField label="Width in metres (optional)" inputMode="decimal" error={errors.widthM?.message} data-cy="drain-width" {...register("widthM")} />
        <TextField label="Depth in metres (optional)" inputMode="decimal" error={errors.depthM?.message} data-cy="drain-depth" {...register("depthM")} />
        <TextAreaField
          label="Note (optional)"
          rows={3}
          maxLength={MAX_SURVEY_NOTE_LENGTH}
          hint="What is blocking it, what it needs, where the water goes."
          error={errors.note?.message}
          data-cy="drain-note"
          {...register("note")}
        />
      </form>
    </Modal>
  );
}
