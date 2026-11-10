import { DEFAULT_WARN_DISTANCE_M, WARN_RADIUS_M, type FloodAheadWarning } from "../types/flood-ahead.types";

/** What the person chose, kept on this device only (a per-device convenience, so localStorage, not the API). */
export interface FloodAheadPreference {
  enabled: boolean;
  radiusM: number;
}

export const FLOOD_AHEAD_STORAGE_KEY = "geoclime:flood-ahead";

export function readFloodAheadPreference(): FloodAheadPreference {
  try {
    const stored = JSON.parse(window.localStorage.getItem(FLOOD_AHEAD_STORAGE_KEY) ?? "null") as Partial<FloodAheadPreference> | null;
    const raw = typeof stored?.radiusM === "number" && Number.isFinite(stored.radiusM) ? Math.round(stored.radiusM) : 0;
    const valid = raw >= WARN_RADIUS_M.min && raw <= WARN_RADIUS_M.max;
    return { enabled: stored?.enabled === true, radiusM: valid ? raw : DEFAULT_WARN_DISTANCE_M };
  } catch {
    // Storage can be blocked (private mode), or hold something else. Start off.
    return { enabled: false, radiusM: DEFAULT_WARN_DISTANCE_M };
  }
}

/** What the browser says when it can't give a position, in words. */
export const GEO_FAILURE_MESSAGES: Record<number, string> = {
  1: "Location is blocked for this site. Allow it in your browser's site settings to get flood warnings.",
  2: "Your device can't work out where you are right now. Warnings resume when it can.",
  3: "Finding your location is taking too long. Warnings resume when it succeeds.",
};

export const warningKey = (w: FloodAheadWarning) => `${w.kind}:${w.id}`;

/** The most warnings kept on screen. */
const MAX_WARNINGS = 4;

/** New warnings replace older ones for the same flood; nearest first, a few at most. */
export function mergeWarnings(current: FloodAheadWarning[], incoming: FloodAheadWarning[]): FloodAheadWarning[] {
  const byFlood = new Map(current.map((w) => [warningKey(w), w]));
  for (const warning of incoming) byFlood.set(warningKey(warning), warning);
  return [...byFlood.values()].sort((a, b) => a.distanceM - b.distanceM).slice(0, MAX_WARNINGS);
}

/** A notification from the system, for when the app is in the background. Best effort: the banner and the buzz already happened. */
export async function showSystemNotification(body: string, tag: string): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    // Installed apps on a phone can only show notifications through the service worker.
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.showNotification("Flood nearby", { body, tag });
    else new Notification("Flood nearby", { body, tag });
  } catch {
    // Not shown; nothing else to do.
  }
}
