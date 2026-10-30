import { useCallback } from "react";
import { endAlert, fetchAlerts, issueAlert } from "../endpoints/alert.endpoints";
import type { FloodAlert, NewAlertBody } from "../types/alert.types";
import { useLoader } from "./useLoader";

/**
 * Alerts for the signed-in Alerts page ("recent": in force, scheduled, and the last 30 days), with
 * issuing and ending for officials and administrators. Not cached: alerts must be current.
 */
export function useAlerts() {
  const { data, setData, ...state } = useLoader<FloodAlert[]>("alerts:recent", async () => {
    const response = await fetchAlerts("recent");
    return response.data ?? [];
  });

  /** Rejects with an ApiError so the form can show a 400's field errors. */
  const issue = useCallback(
    async (body: NewAlertBody): Promise<FloodAlert> => {
      const response = await issueAlert(body);
      if (!response.data) throw new Error(response.message || "The server returned no alert.");
      const created = response.data;
      setData((current) => [created, ...(current ?? [])]);
      return created;
    },
    [setData],
  );

  const end = useCallback(
    async (id: string): Promise<FloodAlert> => {
      const response = await endAlert(id);
      if (!response.data) throw new Error(response.message || "The server returned no alert.");
      const ended = response.data;
      setData((current) => (current ?? []).map((alert) => (alert.id === id ? ended : alert)));
      return ended;
    },
    [setData],
  );

  return { alerts: data ?? [], ...state, issue, end };
}
