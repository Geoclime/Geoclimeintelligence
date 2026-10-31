import { useCallback, useState } from "react";
import type { LonLat } from "../types/admin-unit.types";
import type { ClickedFeature } from "../types/map-layer.types";
import { surveyFeatureIn } from "../utils/survey-click";
import { clearDraft, loadDraft, type SurveyDraft } from "../utils/survey-draft";
import { useSurveySaving } from "./useSurveySaving";
import { useSurveySelection } from "./useSurveySelection";
import { useWalkRecorder } from "./useWalkRecorder";

/**
 * Field survey on the map, in one place: recording a flood's edge or a drain (the recorder), saving it
 * (the form), and opening what was recorded (the popup). `canRecord` is the role check for the screen;
 * the server checks it again on every request. `refresh` goes up whenever something was saved,
 * changed or deleted, so the map fetches its survey layers again.
 */
export function useFieldSurvey(canRecord: boolean) {
  const recorder = useWalkRecorder();
  const [refresh, setRefresh] = useState(0);
  const onChanged = useCallback(() => setRefresh((count) => count + 1), []);
  const selection = useSurveySelection(onChanged);
  const saving = useSurveySaving(recorder, selection.select, onChanged);
  // A walk left unfinished on this device (a reload, a phone that slept): offered once, to continue or discard.
  const [unfinished, setUnfinished] = useState<SurveyDraft | null>(() => (canRecord ? loadDraft() : null));

  const { begin, resume, addPoint, target, tapMode } = recorder;
  const continueUnfinished = useCallback(() => {
    if (unfinished) resume(unfinished);
    setUnfinished(null);
  }, [resume, unfinished]);
  const discardUnfinished = useCallback(() => {
    clearDraft();
    setUnfinished(null);
  }, []);
  const startRecording = useCallback((next: Parameters<typeof begin>[0]) => {
    setUnfinished(null);
    selection.closeSelected();
    begin(next);
  }, [begin, selection]);

  /**
   * A map click while surveying. While a walk is open the map belongs to it: a tap adds a point if
   * "tap the map" is on, and is otherwise ignored, so a stray tap never opens a popup mid-walk.
   * Otherwise a click on a recorded flood or drain opens it. Returns whether the click was used.
   */
  const handleMapClick = useCallback(
    (point: LonLat, features: ClickedFeature[]): boolean => {
      if (target) {
        if (tapMode) addPoint(point);
        return true;
      }
      const found = surveyFeatureIn(features, point);
      if (found) selection.select(found);
      return found !== null;
    },
    [addPoint, selection, tapMode, target],
  );

  return {
    recorder,
    selection,
    saving,
    refresh,
    unfinished,
    continueUnfinished,
    discardUnfinished,
    startRecording,
    handleMapClick,
    recording: target !== null,
  };
}
