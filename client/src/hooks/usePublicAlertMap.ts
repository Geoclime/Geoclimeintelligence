import { useEffect } from "react";
import { fetchPublicAlertMap } from "../endpoints/public.endpoints";
import type { PublicAlertMap } from "../types/public.types";
import { useLoader } from "./useLoader";
import { useRealtimeEvent } from "./useRealtimeEvent";

/** How often alerts are re-checked while the page is open and visible. */
const REFRESH_MS = 2 * 60 * 1000;

/**
 * The alerts in force now and recently published flood reports, for the national alert map. No
 * sign-in needed. Never cached on the client (alerts must be current); it refreshes every two
 * minutes while the tab is visible, and again when the tab comes back into view.
 */
export function usePublicAlertMap() {
  const { data, refetch, ...state } = useLoader<PublicAlertMap>("public-alert-map", async () => {
    const response = await fetchPublicAlertMap();
    if (!response.data) throw new Error(response.message || "The server returned no alerts.");
    return response.data;
  });

  // Signed in, the live connection says when alerts change; the timer covers everyone else.
  useRealtimeEvent("alerts:changed", refetch);

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
