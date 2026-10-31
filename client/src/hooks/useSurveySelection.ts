import { useCallback, useState } from "react";
import { deleteDrainage, deleteFloodExtent, recedeFloodExtent, updateDrainage } from "../endpoints/field-survey.endpoints";
import { errorMessage } from "../transport/api-error";
import type { SelectedSurvey, UpdateDrainageBody } from "../types/field-survey.types";
import { useToast } from "./useToast";

/**
 * The flood or drain open in a popup, and what can be done to it: re-inspect a drain, mark a flood
 * receded, or delete either. Each change closes the popup and has the map draw again (`onChanged`); a
 * failure is shown as a message and leaves the popup open, so nothing looks done that isn't.
 */
export function useSurveySelection(onChanged: () => void) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState<SelectedSurvey | null>(null);
  const [removing, setRemoving] = useState<SelectedSurvey | null>(null);

  const change = useCallback(
    async (work: () => Promise<unknown>, done: string): Promise<boolean> => {
      try {
        await work();
      } catch (failure) {
        showToast({ type: "error", message: errorMessage(failure) });
        return false;
      }
      setSelected(null);
      setRemoving(null);
      onChanged();
      showToast({ type: "success", message: done });
      return true;
    },
    [onChanged, showToast],
  );

  const inspect = useCallback((id: string, body: UpdateDrainageBody) => change(() => updateDrainage(id, body), "Inspection saved."), [change]);
  const recede = useCallback((id: string) => change(() => recedeFloodExtent(id), "Marked as receded. It leaves the map in a week."), [change]);
  const confirmRemove = useCallback(() => {
    if (!removing) return Promise.resolve(false);
    const { id } = removing.properties;
    return change(() => (removing.type === "flood" ? deleteFloodExtent(id) : deleteDrainage(id)), "Deleted.");
  }, [change, removing]);

  return {
    selected,
    select: setSelected,
    closeSelected: useCallback(() => setSelected(null), []),
    removing,
    askRemove: setRemoving,
    closeRemove: useCallback(() => setRemoving(null), []),
    inspect,
    recede,
    confirmRemove,
  };
}
