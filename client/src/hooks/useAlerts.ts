import { useCallback } from "react";
import { QUERY_KEYS, LIVE_POLICY, invalidateQueries } from "../cache/queryClient";
import { deleteAlert, endAlert, fetchAlerts, issueAlert, updateAlert } from "../endpoints/alert.endpoints";
import type { FloodAlert, NewAlertBody, UpdateAlertBody } from "../types/alert.types";
import { useLoader } from "./useLoader";

const KEY = [...QUERY_KEYS.alerts, "recent"];

/**
 * Alerts for the signed-in Alerts page ("recent": in force, scheduled, and the last 30 days), with
 * issuing, editing, ending and deleting for officials and administrators. Remembered for 30 seconds
 * only, so the page opens at once but never shows an old answer for long: another official's change
 * arrives over the live connection (components/layout/LiveUpdates.tsx re-asks the server at
 * once), and any change made here clears the public alert map's copy.
 */
export function useAlerts() {
  const { data, setData, refetch, ...state } = useLoader<FloodAlert[]>(
    KEY,
    async () => {
      const response = await fetchAlerts("recent");
      return response.data ?? [];
    },
    LIVE_POLICY,
  );
  // Another official issued, edited, ended or deleted an alert: LiveUpdates marks this stale and it is asked for again.

  /** Rejects with an ApiError so the form can show a 400's field errors. */
  const issue = useCallback(
    async (body: NewAlertBody): Promise<FloodAlert> => {
      const response = await issueAlert(body);
      if (!response.data) throw new Error(response.message || "The server returned no alert.");
      const created = response.data;
      invalidateQueries(QUERY_KEYS.alerts, KEY);
      setData((current) => [created, ...(current ?? [])]);
      return created;
    },
    [setData],
  );

  /** Rejects with an ApiError so the form can show a 400's field errors. */
  const update = useCallback(
    async (id: string, body: UpdateAlertBody): Promise<FloodAlert> => {
      const response = await updateAlert(id, body);
      if (!response.data) throw new Error(response.message || "The server returned no alert.");
      const updated = response.data;
      invalidateQueries(QUERY_KEYS.alerts, KEY);
      setData((current) => (current ?? []).map((alert) => (alert.id === id ? updated : alert)));
      return updated;
    },
    [setData],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await deleteAlert(id);
      invalidateQueries(QUERY_KEYS.alerts, KEY);
      setData((current) => (current ?? []).filter((alert) => alert.id !== id));
    },
    [setData],
  );

  const end = useCallback(
    async (id: string): Promise<FloodAlert> => {
      const response = await endAlert(id);
      if (!response.data) throw new Error(response.message || "The server returned no alert.");
      const ended = response.data;
      invalidateQueries(QUERY_KEYS.alerts, KEY);
      setData((current) => (current ?? []).map((alert) => (alert.id === id ? ended : alert)));
      return ended;
    },
    [setData],
  );

  return { alerts: data ?? [], ...state, refetch, issue, update, remove, end };
}
