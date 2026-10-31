import type { LonLat } from "../types/admin-unit.types";
import type { SurveyTarget } from "../types/field-survey.types";

/**
 * An unfinished walk, kept on this device so a phone that reloads the page (they do, when the app has
 * been in the background) doesn't lose twenty minutes of walking. It lives only in this browser's
 * localStorage and is never sent anywhere until the walk is finished and saved.
 */

const KEY = "geoclime.survey-draft.v1";
/** A draft older than this is a different day's walk: the flood has moved on. */
const MAX_AGE_MS = 24 * 3_600_000;

export interface SurveyDraft {
  target: SurveyTarget;
  points: LonLat[];
  /** How many of the points came from GPS rather than a tap, which decides whether it counts as "walked". */
  gpsPoints: number;
  /** The accuracy of each GPS point kept, in metres. */
  accuracies: number[];
  savedAt: number;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const TARGETS: readonly SurveyTarget[] = ["flood", "drain-line", "drain-spot"];

const isPoint = (value: unknown): value is LonLat =>
  Array.isArray(value) && value.length === 2 && typeof value[0] === "number" && typeof value[1] === "number" && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;

/** The stored draft, if there is one that is whole and recent. Anything else reads as none, never as an error. */
export function loadDraft(store: Store | undefined = safeStore(), now = Date.now()): SurveyDraft | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as Partial<SurveyDraft>;
    if (!draft.target || !TARGETS.includes(draft.target)) return null;
    if (!Array.isArray(draft.points) || draft.points.length === 0 || !draft.points.every(isPoint)) return null;
    if (typeof draft.savedAt !== "number" || now - draft.savedAt > MAX_AGE_MS) return null;
    return {
      target: draft.target,
      points: draft.points,
      gpsPoints: typeof draft.gpsPoints === "number" ? draft.gpsPoints : 0,
      accuracies: Array.isArray(draft.accuracies) ? draft.accuracies.filter((value): value is number => typeof value === "number") : [],
      savedAt: draft.savedAt,
    };
  } catch {
    return null;
  }
}

/** Keeps the draft, or forgets it when there is nothing to keep. Storage that refuses (a private window) is ignored. */
export function saveDraft(draft: Omit<SurveyDraft, "savedAt"> | null, store: Store | undefined = safeStore(), now = Date.now()): void {
  try {
    if (!draft || draft.points.length === 0) store?.removeItem(KEY);
    else store?.setItem(KEY, JSON.stringify({ ...draft, savedAt: now }));
  } catch {
    // Nothing to do: the walk carries on in memory, it just won't survive a reload.
  }
}

export function clearDraft(store: Store | undefined = safeStore()): void {
  saveDraft(null, store);
}

function safeStore(): Store | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
