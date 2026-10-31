import { useCallback, useState } from "react";
import { saveDrainage, saveFloodExtent } from "../endpoints/field-survey.endpoints";
import type { SelectedSurvey } from "../types/field-survey.types";
import { formatArea } from "../utils/survey-geometry";
import { selectedFlood, toDrainBody, toFloodBody, type DrainFormValues, type FloodFormValues } from "../components/map/survey-form.schema";
import { useToast } from "./useToast";
import type { useWalkRecorder } from "./useWalkRecorder";

/**
 * Saving a finished walk: the form that asks what was found, and the calls that store it. A save that
 * works clears the walk (here and on this device), has the map draw again, and opens what was just
 * saved, a flood with what it reaches. A save that fails rejects, so the form can show why, and the
 * walk is kept: nothing is lost to a bad signal or a refused request.
 */
export function useSurveySaving(recorder: ReturnType<typeof useWalkRecorder>, select: (selected: SelectedSurvey) => void, onChanged: () => void) {
  const { showToast } = useToast();
  const [formOpen, setFormOpen] = useState(false);
  // A new key each time the form opens, so it starts from empty values instead of the last ones.
  const [formKey, setFormKey] = useState(0);

  const openForm = useCallback(() => {
    setFormKey((key) => key + 1);
    setFormOpen(true);
  }, []);
  const closeForm = useCallback(() => setFormOpen(false), []);

  const saved = useCallback(
    (selected: SelectedSurvey, message: string) => {
      recorder.reset();
      setFormOpen(false);
      onChanged();
      select(selected);
      showToast({ type: "success", message });
    },
    [onChanged, recorder, select, showToast],
  );

  const saveFlood = useCallback(
    async (values: FloodFormValues) => {
      const { data } = await saveFloodExtent(toFloodBody(values, { points: recorder.points }, { method: recorder.method, accuracyM: recorder.accuracyM }));
      if (data) saved({ ...selectedFlood(data.extent), impact: data.impact }, `Flood saved: ${formatArea(data.extent.areaM2)}.`);
    },
    [recorder.accuracyM, recorder.method, recorder.points, saved],
  );

  const saveDrain = useCallback(
    async (values: DrainFormValues) => {
      const { data } = await saveDrainage(toDrainBody(values, { points: recorder.points }, recorder.method));
      if (!data) return;
      const { id, kind, condition, name, widthM, depthM, lengthM, note, lastCheckedAt, longitude, latitude } = data;
      saved({ type: "drain", point: [longitude, latitude], properties: { id, kind, condition, name, widthM, depthM, lengthM, note, lastCheckedAt } }, "Drainage saved.");
    },
    [recorder.method, recorder.points, saved],
  );

  return { formOpen, formKey, openForm, closeForm, saveFlood, saveDrain };
}
