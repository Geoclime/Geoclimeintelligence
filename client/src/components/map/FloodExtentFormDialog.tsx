import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { useForm } from "react-hook-form";
import { WATER_DEPTHS } from "../../types/flood-report.types";
import { applySubmitError } from "../../utils/form-errors";
import { formatDistance } from "../../utils/geo-distance";
import { formatArea } from "../../utils/survey-geometry";
import { WATER_DEPTH_INFO } from "../../utils/water-depth";
import { Button } from "../shared/Button";
import { Callout } from "../shared/Callout";
import { Modal } from "../shared/Modal";
import { SelectField } from "../shared/SelectField";
import { TextAreaField } from "../shared/TextAreaField";
import { floodFormSchema, MAX_SURVEY_NOTE_LENGTH, type FloodFormValues } from "./survey-form.schema";

interface FloodExtentFormDialogProps {
  /** What the recorder measured on screen. The saved figure is measured again on the server. */
  areaM2: number;
  perimeterM: number;
  pointCount: number;
  method: "walked" | "drawn";
  onClose: () => void;
  /** Saves the flood. Rejects with an ApiError so the form can show why. */
  onSubmit: (values: FloodFormValues) => Promise<void>;
}

/** The last step of recording a flood: how deep, and anything worth saying. Render it with a fresh `key` each time it opens. */
export function FloodExtentFormDialog({ areaM2, perimeterM, pointCount, method, onClose, onSubmit }: FloodExtentFormDialogProps) {
  const formId = useId();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FloodFormValues>({ resolver: zodResolver(floodFormSchema), defaultValues: { depth: "", note: "" } });

  const onFormSubmit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (failure) {
      // A refused outline ("covers less than 10 m²") has no field here, so it shows at the top of the form.
      applySubmitError(failure, setError, ["depth", "note"]);
    }
  });

  return (
    <Modal
      open
      title="Save this flood"
      description={`About ${formatArea(areaM2)}, ${formatDistance(perimeterM)} around, from ${pointCount} points ${method === "walked" ? "walked with GPS" : "drawn on the map"}. The saved area is measured again on the server.`}
      onClose={onClose}
      dismissible={!isSubmitting}
      dataCy="flood-form-dialog"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Keep recording
          </Button>
          <Button type="submit" form={formId} loading={isSubmitting} loadingLabel="Saving…" data-cy="save-flood">
            Save flood
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
        <SelectField label="How deep is the water?" hint="The typical depth, as for a flood report. Optional." error={errors.depth?.message} data-cy="flood-depth" {...register("depth")}>
          <option value="">Not sure</option>
          {WATER_DEPTHS.map((depth) => (
            <option key={depth} value={depth}>
              {WATER_DEPTH_INFO[depth].label} ({WATER_DEPTH_INFO[depth].metres})
            </option>
          ))}
        </SelectField>
        <TextAreaField
          label="Note (optional)"
          rows={3}
          maxLength={MAX_SURVEY_NOTE_LENGTH}
          hint="What caused it, who is cut off, which road is closed."
          error={errors.note?.message}
          data-cy="flood-note"
          {...register("note")}
        />
      </form>
    </Modal>
  );
}
