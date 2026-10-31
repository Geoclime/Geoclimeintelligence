import { useCallback, useEffect, useRef, useState } from "react";
import type { LonLat } from "../types/admin-unit.types";
import type { SurveyTarget } from "../types/field-survey.types";
import { canFinish, TARGET_INFO } from "../utils/field-survey";
import { clearDraft, saveDraft, type SurveyDraft } from "../utils/survey-draft";
import { describeGpsError, fixOf, NO_GPS_MESSAGE } from "../utils/gps";
import { judgeFix, medianOf, pathLengthMetres, polygonAreaMetres, type Fix } from "../utils/survey-geometry";
import { addPoint, draftOf, dropLast, EMPTY_WALK, methodOf, walkFromDraft, type Origin, type Walk } from "../utils/walk-state";
import { useScreenAwake } from "./useScreenAwake";

export type WalkPhase = "idle" | "walking" | "paused";

/**
 * Records a shape on the ground: a flood's edge, a drain, or one spot. Walking follows the GPS and keeps
 * a point per real step (judgeFix); points can also be tapped on the map. The screen stays awake and
 * the unfinished walk is kept on this device. Nothing is sent anywhere until it is saved.
 */
export function useWalkRecorder() {
  const [target, setTarget] = useState<SurveyTarget | null>(null);
  const [walk, setWalk] = useState<Walk>(EMPTY_WALK);
  const [phase, setPhase] = useState<WalkPhase>("idle");
  const [fix, setFix] = useState<Fix | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tapMode, setTapMode] = useState(false);
  const [locating, setLocating] = useState(false);
  // Mirrors of the state for the GPS callback, which outlives the render that started it. Read only in callbacks.
  const targetRef = useRef<SurveyTarget | null>(null);
  const walkRef = useRef<Walk>(EMPTY_WALK);
  const watchRef = useRef<number | null>(null);
  useScreenAwake(phase === "walking");

  const commit = useCallback((next: Walk) => {
    walkRef.current = next;
    setWalk(next);
  }, []);
  const add = useCallback(
    (point: LonLat, origin: Origin, accuracy?: number) => {
      const single = targetRef.current !== null && TARGET_INFO[targetRef.current].maxPoints === 1;
      commit(addPoint(walkRef.current, point, origin, { accuracy, single }));
    },
    [commit],
  );
  const stopWatching = useCallback(() => {
    if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    watchRef.current = null;
  }, []);
  const failure = useCallback((position: GeolocationPositionError) => setError(describeGpsError(position)), []);
  const fresh = useCallback(
    (next: SurveyTarget | null, nextWalk: Walk, nextPhase: WalkPhase) => {
      stopWatching();
      targetRef.current = next;
      setTarget(next);
      commit(nextWalk);
      setPhase(nextPhase);
      setFix(null);
      setError(null);
      setTapMode(false);
    },
    [commit, stopWatching],
  );

  const begin = useCallback((next: SurveyTarget) => fresh(next, EMPTY_WALK, "idle"), [fresh]);
  /** Carries on with a walk that was kept on this device. */
  const resume = useCallback((draft: SurveyDraft) => fresh(draft.target, walkFromDraft(draft), "paused"), [fresh]);
  /** Stops and forgets the walk, here and on this device. */
  const reset = useCallback(() => {
    fresh(null, EMPTY_WALK, "idle");
    clearDraft();
  }, [fresh]);

  /** Follows the GPS, keeping a point each time you have moved far enough. */
  const start = useCallback(() => {
    if (!("geolocation" in navigator)) return setError(NO_GPS_MESSAGE);
    stopWatching();
    setError(null);
    setPhase("walking");
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const next = fixOf(position);
        setFix(next);
        setError(null);
        // A single spot is marked with "Mark here", never by walking past it.
        if (targetRef.current && TARGET_INFO[targetRef.current].maxPoints === 1) return;
        if (judgeFix(walkRef.current.points, next) === "added") add(next.point, "gps", next.accuracy);
      },
      failure,
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  }, [add, failure, stopWatching]);

  const pause = useCallback(() => {
    stopWatching();
    setPhase("paused");
  }, [stopWatching]);

  /** Adds the point where you stand right now, whatever the distance from the last: a corner, or the spot itself. */
  const markHere = useCallback(() => {
    if (!("geolocation" in navigator)) return setError(NO_GPS_MESSAGE);
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        const next = fixOf(position);
        setFix(next);
        add(next.point, "gps", next.accuracy);
      },
      (position) => {
        setLocating(false);
        failure(position);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 },
    );
  }, [add, failure]);

  const addTapped = useCallback((point: LonLat) => add(point, "tap"), [add]);
  const undo = useCallback(() => commit(dropLast(walkRef.current)), [commit]);

  useEffect(() => {
    if (target) saveDraft(draftOf(target, walk));
  }, [target, walk]);
  // Leaving the screen stops the GPS: never a watch left running in the background.
  useEffect(() => stopWatching, [stopWatching]);

  const closes = target ? TARGET_INFO[target].closes : false;
  return {
    target,
    points: walk.points,
    phase,
    fix,
    error,
    locating,
    tapMode,
    setTapMode,
    begin,
    resume,
    start,
    pause,
    markHere,
    addPoint: addTapped,
    undo,
    reset,
    method: methodOf(walk),
    accuracyM: medianOf(walk.accuracies),
    /** A perimeter for a flood (the ring closes), a length for a drain; the area is an estimate for the screen, 0 for a drain. */
    distanceM: pathLengthMetres(walk.points, closes),
    areaM2: closes ? polygonAreaMetres(walk.points) : 0,
    ready: target ? canFinish(target, walk.points.length) : false,
  };
}
