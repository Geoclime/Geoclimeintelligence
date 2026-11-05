import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { useForm } from "react-hook-form";
import { DRAIN_MATERIALS, DRAINAGE_CONDITIONS, FLOW_DIRECTIONS, type SurveyTarget } from "../../types/field-survey.types";
import type { PendingPhoto } from "../../types/photo.types";
import { CONDITION_INFO, DRAINAGE_KIND_LABEL, FLOW_LABEL, MATERIAL_LABEL } from "../../utils/field-survey";
import { applySubmitError } from "../../utils/form-errors";
import { formatDistance } from "../../utils/geo-distance";
import { PhotoPicker } from "../photos/PhotoPicker";
import { MAX_PHOTOS } from "../photos/PhotoSection";
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
  /** Whether this person may add photos (photos.add). */
  canAddPhotos: boolean;
  onClose: () => void;
  /** Saves the drainage, then sends the photos. Rejects with an ApiError so the form can show why. */
  onSubmit: (values: DrainFormValues, photos: PendingPhoto[]) => Promise<void>;
}

/**
 * The last step of recording drainage: what it is, what shape it is in, its size, which way the water
 * goes (a drain) or the pipe's size and material (a culvert or other spot), and photos. Render it with a
 * fresh `key` each time it opens.
 */
export function DrainageFormDialog({ target, distanceM, canAddPhotos, onClose, onSubmit }: DrainageFormDialogProps) {
  const formId = useId();
  const kinds = kindsFor(target);
  const line = target === "drain-line";
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DrainFormValues>({
    resolver: zodResolver(drainFormSchema),
    // The condition has no default: guessing "clear" for a drain nobody looked at closely would be a false record.
    defaultValues: { kind: kinds[0], condition: "" as DrainFormValues["condition"], name: "", widthM: "", depthM: "", flowDirection: "", diameterM: "", material: "", barrels: "", note: "" },
  });

  const onFormSubmit = handleSubmit(async (values) => {
    try {
      await onSubmit(values, photos);
    } catch (failure) {
      applySubmitError(failure, setError, ["kind", "condition", "name", "widthM", "depthM", "flowDirection", "diameterM", "material", "barrels", "note"]);
    }
  });

  return (
    <Modal
      open
      title="Save this drainage"
      description={line ? `A drain about ${formatDistance(distanceM)} long. The length is measured again on the server.` : "One spot: a culvert, outfall, inlet or pond."}
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
        {line && (
          <SelectField
            label="Which way does the water flow? (optional)"
            hint="The map draws arrows along the drain. Leave it blank if you can't tell."
            error={errors.flowDirection?.message}
            data-cy="drain-flow"
            {...register("flowDirection")}
          >
            <option value="">Not sure</option>
            {FLOW_DIRECTIONS.map((direction) => (
              <option key={direction} value={direction}>
                {FLOW_LABEL[direction]}
              </option>
            ))}
          </SelectField>
        )}
        <TextField label="Name (optional)" placeholder="e.g. Aba Road drain" autoComplete="off" error={errors.name?.message} data-cy="drain-name" {...register("name")} />
        <TextField label="Width in metres (optional)" inputMode="decimal" error={errors.widthM?.message} data-cy="drain-width" {...register("widthM")} />
        <TextField label="Depth in metres (optional)" inputMode="decimal" error={errors.depthM?.message} data-cy="drain-depth" {...register("depthM")} />
        {!line && (
          <>
            <TextField
              label="Pipe diameter in metres (optional)"
              hint="For a culvert: the inside width of one pipe."
              inputMode="decimal"
              error={errors.diameterM?.message}
              data-cy="drain-diameter"
              {...register("diameterM")}
            />
            <TextField label="Pipes side by side (optional)" inputMode="numeric" error={errors.barrels?.message} data-cy="drain-barrels" {...register("barrels")} />
            <SelectField label="What is it made of? (optional)" error={errors.material?.message} data-cy="drain-material" {...register("material")}>
              <option value="">Not sure</option>
              {DRAIN_MATERIALS.map((material) => (
                <option key={material} value={material}>
                  {MATERIAL_LABEL[material]}
                </option>
              ))}
            </SelectField>
          </>
        )}
        <TextAreaField
          label="Note (optional)"
          rows={3}
          maxLength={MAX_SURVEY_NOTE_LENGTH}
          hint="What is blocking it, what it needs, where the water goes."
          error={errors.note?.message}
          data-cy="drain-note"
          {...register("note")}
        />
        {canAddPhotos && (
          <fieldset className="role-picker">
            <legend className="role-picker__legend">Photos (optional)</legend>
            <PhotoPicker photos={photos} onChange={setPhotos} max={MAX_PHOTOS} of="the drainage" disabled={isSubmitting} />
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
