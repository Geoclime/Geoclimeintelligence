import { useEffect, useRef } from "react";
import { onRealtime } from "../transport/realtime";

/**
 * Runs `handler` whenever the server sends `event` over the live connection (e.g. "alerts:changed").
 * The connection itself is opened once for the whole app (components/layout/LiveUpdates.tsx); this
 * only listens.
 */
export function useRealtimeEvent<T = unknown>(event: string, handler: (payload: T) => void): void {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => onRealtime<T>(event, (payload) => latest.current(payload)), [event]);
}
