import { useCallback, useState } from "react";
import { deleteDrainage, deleteFloodExtent, recedeFloodExtent, reopenFloodExtent, updateDrainage } from "../endpoints/field-survey.endpoints";
import { errorMessage } from "../transport/api-error";
import type { SelectedSurvey, UpdateDrainageBody } from "../types/field-survey.types";
import { removedChange, type SurveyChange } from "../utils/survey-patches";
import { useToast } from "./useToast";

/**
 * The flood or drain open in a popup, and what can be done to it: re-inspect a drain, mark a flood
 * receded (and put it back, straight away from the toast's Undo, or later from its popup), or delete either. Each change closes the popup and has the map draw again (`onChanged`); a
 * failure is shown as a message and leaves the popup open, so nothing looks done that isn't.
 */
export function useSurveySelection(onChanged: (change?: SurveyChange) => void) {
  const { showToast } = useToast();
  const [selected, setSelected] = useState<SelectedSurvey | null>(null);
  const [removing, setRemoving] = useState<SelectedSurvey | null>(null);

  const run = useCallback(
    async (work: () => Promise<unknown>, done: string, change?: SurveyChange, undo?: () => void): Promise<boolean> => {
      try {
        await work();
      } catch (failure) {
        showToast({ type: "error", message: errorMessage(failure) });
        return false;
      }
      setSelected(null);
      setRemoving(null);
      onChanged(change);
      showToast({ type: "success", message: done, ...(undo ? { action: { label: "Undo", onClick: undo } } : {}) });
      return true;
    },
    [onChanged, showToast],
  );

  const inspect = useCallback(
    (id: string, body: UpdateDrainageBody) =>
      run(() => updateDrainage(id, body), "Inspection saved.", body.condition ? { kind: "drain-condition", id, condition: body.condition } : undefined),
    [run],
  );
  const reopen = useCallback((id: string) => run(() => reopenFloodExtent(id), "Marked as active again.", { kind: "flood-state", id, receded: false }), [run]);
  // A slip of the finger is easy to make and the toast is where it is noticed, so it carries the way back.
  const recede = useCallback(
    (id: string) => run(() => recedeFloodExtent(id), "Marked as receded. It leaves the map in a week.", { kind: "flood-state", id, receded: true }, () => void reopen(id)),
    [run, reopen],
  );
  const confirmRemove = useCallback(() => {
    if (!removing) return Promise.resolve(false);
    const { id } = removing.properties;
    return run(() => (removing.type === "flood" ? deleteFloodExtent(id) : deleteDrainage(id)), "Deleted.", removedChange(removing));
  }, [run, removing]);

  return {
    selected,
    select: setSelected,
    closeSelected: useCallback(() => setSelected(null), []),
    removing,
    askRemove: setRemoving,
    closeRemove: useCallback(() => setRemoving(null), []),
    inspect,
    recede,
    reopen,
    confirmRemove,
  };
}
