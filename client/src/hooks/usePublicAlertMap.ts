import { useEffect } from "react";
import { ALERTS_POLICY, QUERY_KEYS } from "../cache/queryClient";
import { fetchPublicAlertMap } from "../endpoints/public.endpoints";
import type { PublicAlertMap } from "../types/public.types";
import { useLoader } from "./useLoader";

/** How often alerts are re-checked while the page is open and visible: only a safety net for a dropped live connection. A check that finds nothing new is a tiny 304. */
const REFRESH_MS = 60 * 1000;

/**
 * The alerts in force now and recently published flood reports, for the national alert map. No
 * sign-in needed. Remembered for 10 seconds only (alerts must be current): the landing page, the
 * Alerts page and the status line share one answer instead of each asking. A change arrives over
 * the live connection, which every visitor has, signed in or not (components/layout/LiveUpdates.tsx
 * marks this stale and it is asked for again at once). As a safety net for a dropped connection it
 * also re-asks every minute while the tab is visible, and when the tab comes back into view. The
 * server tells browsers to check before reusing a copy, so nothing between here and the database
 * holds an alert back.
 */
export function usePublicAlertMap() {
  const { data, refetch, ...state } = useLoader<PublicAlertMap>(
    [...QUERY_KEYS.alerts, "public-map"],
    async () => {
      const response = await fetchPublicAlertMap();
      if (!response.data) throw new Error(response.message || "The server returned no alerts.");
      return response.data;
    },
    ALERTS_POLICY,
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") refetch();
    }, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && refetch();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch]);

  return { alertMap: data, refetch, ...state };
}
