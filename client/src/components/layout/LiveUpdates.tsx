import { useEffect, useRef } from "react";
import { invalidateQueries, QUERY_KEYS } from "../../cache/queryClient";
import { useAuth } from "../../hooks/useAuth";
import { useRealtimeEvent } from "../../hooks/useRealtimeEvent";
import { connectRealtime, disconnectRealtime, reconnectRealtime } from "../../transport/realtime";

/**
 * Keeps what is on screen current, without a refresh. It holds the app's one Socket.IO connection,
 * for everyone: a visitor who isn't signed in connects too, and hears that the public alert map
 * changed, which is how a severe alert reaches the landing page at once. Signing in or out
 * reconnects it, so the server knows who is listening.
 *
 * Each signal is only "this changed": it marks the matching data stale (TanStack Query), and
 * whatever is on screen asks the REST API again, which applies the usual access rules. So a signal
 * can't show anyone more than loading the page would.
 *
 *   alerts:changed   an alert was issued, edited, ended or deleted, or a published report changed
 *   reports:changed  the review queue, or your own reports
 *   users:changed    a role was requested or answered (administrators)
 *   account:changed  your own role or access was just changed
 *
 * Notifications arrive separately (contexts/NotificationContext.tsx). Renders nothing.
 */
export function LiveUpdates() {
  const { status, retry } = useAuth();

  useEffect(() => {
    connectRealtime();
    return disconnectRealtime;
  }, []);

  const signedIn = status === "signed-in";
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (signedIn === wasSignedIn.current) return;
    wasSignedIn.current = signedIn;
    reconnectRealtime();
  }, [signedIn]);

  useRealtimeEvent("alerts:changed", () => invalidateQueries(QUERY_KEYS.alerts));
  useRealtimeEvent("reports:changed", () => {
    invalidateQueries(QUERY_KEYS.reports);
    invalidateQueries(QUERY_KEYS.myReports);
  });
  useRealtimeEvent("users:changed", () => invalidateQueries(QUERY_KEYS.users));
  useRealtimeEvent("account:changed", () => {
    retry();
    // The server put this connection in rooms for the old role: reconnect so it joins the new ones.
    reconnectRealtime();
  });

  return null;
}
