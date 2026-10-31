import { hashKey, QueryClient, type QueryKey } from "@tanstack/react-query";
import { IS_E2E } from "../config/env";
import { toApiError } from "../transport/api-error";

/**
 * The app's one TanStack Query client: the in-memory cache every read hook shares (standard
 * section 14). What it gives the app:
 *   - a screen opened again shows its last answer at once, with no spinner, and nothing is asked
 *     while the answer is fresh (`staleMs`); once stale it is shown and re-fetched behind it;
 *   - two parts of the page asking for the same thing at once share one request;
 *   - an answer is kept for a while after nobody shows it (`gcMs`), then dropped;
 *   - a write invalidates what it touches (invalidateQueries), never relying on expiry alone, and
 *     signing out clears everything (clearQueries) so one account's data never reaches the next.
 * It lives in memory only: nothing is written to localStorage or IndexedDB, and a reload starts empty.
 * Never cache a bbox-keyed map layer (useMapLayer, useAdminUnitLayer): the viewport changes
 * constantly, so the cache would grow without bound and almost never hit.
 */

/** How long an answer is trusted. The hook that reads it picks one of the policies below. */
export interface CachePolicy {
  /** Fresh for this long: opening the screen again inside it asks nothing. */
  staleMs: number;
  /** Kept this long after the last screen showing it closes; shown at once, and re-fetched, if reopened inside it. */
  gcMs: number;
}

const MINUTE = 60_000;

/** Areas, countries, the layer list, the public overview: they change when an administrator loads data. */
export const REFERENCE_POLICY: CachePolicy = { staleMs: 15 * MINUTE, gcMs: 60 * MINUTE };
/** Alerts, reports, the inbox, the user list: they change, but not by the second. Realtime events and writes refresh them sooner. */
export const LIVE_POLICY: CachePolicy = { staleMs: 30_000, gcMs: 5 * MINUTE };
/**
 * The public alert map, on the landing page and the Alerts page: a severe alert has to show within
 * seconds, so an answer is trusted for 10 seconds only. A change normally arrives over the live
 * connection and is asked for at once (components/layout/LiveUpdates.tsx); this and the page's own
 * polling (usePublicAlertMap) are the safety net if that connection is down.
 */
export const ALERTS_POLICY: CachePolicy = { staleMs: 10_000, gcMs: 5 * MINUTE };
/** A person's own settings: they change only when that person changes them, and saving updates the cache. */
export const SETTINGS_POLICY: CachePolicy = { staleMs: 5 * MINUTE, gcMs: 30 * MINUTE };

/** The first part of every query key, so a write can invalidate everything that depends on it. */
export const QUERY_KEYS = {
  countries: ["countries"],
  adminUnits: ["admin-units"],
  mapLayers: ["map-layers"],
  rainfall: ["rainfall"],
  public: ["public"],
  alerts: ["alerts"],
  reports: ["reports"],
  myReports: ["my-reports"],
  notifications: ["notifications"],
  settings: ["settings"],
  users: ["users"],
} as const satisfies Record<string, QueryKey>;

/**
 * Worth asking again: a dropped connection, a timeout or a server fault, twice at most. A 4xx is
 * the server's answer (not allowed, not found, invalid) and asking again won't change it. Never in
 * the offline test build, so a spec that stubs a failure sees it at once.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (IS_E2E || failureCount >= 2) return false;
  const { kind, status } = toApiError(error);
  return kind === "network" || kind === "timeout" || (status !== null && status >= 500);
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: shouldRetry } },
});

/**
 * Marks every remembered answer under `root` stale, and re-asks the ones currently on screen.
 * `keep` is one key to leave as it is, for a screen that has just updated it in place.
 */
export function invalidateQueries(root: QueryKey, keep?: QueryKey): void {
  const kept = keep ? hashKey(keep) : null;
  void queryClient.invalidateQueries({ queryKey: root, predicate: kept ? (query) => query.queryHash !== kept : undefined });
}

/** Forgets everything: on sign-out, so the next person to sign in on this device never sees the last one's data. */
export function clearQueries(): void {
  queryClient.clear();
}
