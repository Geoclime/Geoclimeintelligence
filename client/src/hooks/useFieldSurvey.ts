import { useCallback, useState } from "react";
import type { LonLat } from "../types/admin-unit.types";
import type { ClickedFeature } from "../types/map-layer.types";
import { surveyFeatureIn } from "../utils/survey-click";
import { MAX_PATCHES, type SurveyChange, type SurveyPatch } from "../utils/survey-patches";
import { clearDraft, loadDraft, type SurveyDraft } from "../utils/survey-draft";
import { useSurveySaving } from "./useSurveySaving";
import { useSurveySelection } from "./useSurveySelection";
import { useWalkRecorder } from "./useWalkRecorder";

/**
 * Field survey on the map, in one place: recording a flood's edge or a drain (the recorder), saving it
 * (the form), and opening what was recorded (the popup). `canRecord` is the role check for the screen;
 * the server checks it again on every request. Whenever something is saved, changed or deleted, `refresh`
 * goes up so the map fetches its survey layers again, and `patches` say what changed so it can be drawn
 * at once instead of after that fetch. `revealLayer` switches on the layer of what was just saved.
 */
export function useFieldSurvey(canRecord: boolean, revealLayer?: (layer: "floodExtents" | "drainage") => void) {
  const recorder = useWalkRecorder();
  const [refresh, setRefresh] = useState(0);
  const [patches, setPatches] = useState<SurveyPatch[]>([]);
  const onChanged = useCallback(
    (change?: SurveyChange) => {
      setRefresh((count) => count + 1);
      if (!change) return;
      setPatches((current) => [...current.slice(1 - MAX_PATCHES), { ...change, at: Date.now() }]);
      if (change.kind === "flood-added") revealLayer?.("floodExtents");
      if (change.kind === "drain-added") revealLayer?.("drainage");
    },
    [revealLayer],
  );
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
    patches,
    unfinished,
    continueUnfinished,
    discardUnfinished,
    startRecording,
    handleMapClick,
    recording: target !== null,
  };
}
