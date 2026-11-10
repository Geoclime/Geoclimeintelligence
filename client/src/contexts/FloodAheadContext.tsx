import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLiveLocation } from "../hooks/useLiveLocation";
import { useRealtimeEvent } from "../hooks/useRealtimeEvent";
import { useScreenAwake } from "../hooks/useScreenAwake";
import { sendRealtime } from "../transport/realtime";
import type { FloodAheadAck, FloodAheadWarning } from "../types/flood-ahead.types";
import { describeWarning } from "../utils/flood-ahead";
import {
  FLOOD_AHEAD_STORAGE_KEY,
  GEO_FAILURE_MESSAGES,
  mergeWarnings,
  readFloodAheadPreference,
  showSystemNotification,
  warningKey,
} from "../utils/flood-ahead-device";

/** Why warnings can't be given right now, beyond the device refusing its location (`problem`). */
export type FloodAheadIssue = "offline" | "inaccurate" | "unavailable";

/** The last time the server checked the position, and what it found. */
export interface FloodAheadCheck {
  at: number;
  floodsNearby: number;
  nearestM: number | null;
}

export interface FloodAheadContextValue {
  /** Whether this browser can share its location at all. */
  supported: boolean;
  enabled: boolean;
  /** How far ahead to warn, in metres. */
  radiusM: number;
  /** The device's own refusal or failure, in words (permission denied, no signal), or null. */
  problem: string | null;
  issue: FloodAheadIssue | null;
  /** How sure the device is of the position, in metres, or null before the first fix. */
  accuracyM: number | null;
  lastCheck: FloodAheadCheck | null;
  /** Warnings on screen now, nearest first; empty when none or dismissed. */
  warnings: FloodAheadWarning[];
  turnOn: () => void;
  turnOff: () => void;
  setRadius: (metres: number) => void;
  dismiss: () => void;
}

export const FloodAheadContext = createContext<FloodAheadContextValue | null>(null);

const SUPPORTED = typeof navigator !== "undefined" && "geolocation" in navigator;

/** How often the position is sent: often while moving, less while still (a flood can still be recorded near someone standing). The server ignores anything faster than 3 seconds. */
const MOVING_GAP_MS = 5_000;
const STILL_GAP_MS = 10_000;
/** How often it is checked whether a send is due. */
const SEND_CHECK_MS = 2_000;
/** Moving faster than this, in metres a second, counts as travelling (a slow walk is about 1.4). */
const MOVING_SPEED_MS = 1;
/** Mirrors the server's limit: a position less sure than this is not used, so it is not sent. */
const MAX_ACCURACY_M = 1_000;

/**
 * Warns when you are near a place that is flooded now, while the app is open.
 *
 * While it is on, the device's position (followed through the shared LiveLocation watch) is sent to
 * the server over the live connection every few seconds. The server checks it against the floods near
 * it (in PostGIS) and answers with a warning each time you come within a new distance of one: "Flood
 * 2 km away", then "1 km". The position is used for that check only: the server does not store or log
 * it, and this app keeps just the latest fix in memory for the status line. It is opt-in, and off until
 * someone turns it on. While on, the screen is kept awake so the position keeps updating (a phone stops
 * sharing it once the screen locks). The choice (on or off, and the distance) is remembered on this device only.
 */
export function FloodAheadProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState(readFloodAheadPreference);
  const [sendIssue, setSendIssue] = useState<FloodAheadIssue | null>(null);
  const [lastCheck, setLastCheck] = useState<FloodAheadCheck | null>(null);
  const [warnings, setWarnings] = useState<FloodAheadWarning[]>([]);

  const enabled = preference.enabled && SUPPORTED;
  const radiusM = preference.radiusM;
  const { fix, errorCode } = useLiveLocation(enabled);
  useScreenAwake(enabled);

  const problem = errorCode === null ? null : (GEO_FAILURE_MESSAGES[errorCode] ?? "Your location isn't available.");
  const accuracyM = fix ? Math.round(fix.accuracy) : null;
  const issue = fix && fix.accuracy > MAX_ACCURACY_M ? "inaccurate" : sendIssue;

  // Read inside the send timer, which outlives the render that started it.
  const fixRef = useRef(fix);
  const radiusRef = useRef(radiusM);
  const lastSentRef = useRef(0);
  /** One send at a time: a slow answer never has later positions piling up behind it. */
  const sendingRef = useRef(false);
  useEffect(() => {
    fixRef.current = fix;
    radiusRef.current = radiusM;
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(FLOOD_AHEAD_STORAGE_KEY, JSON.stringify(preference));
    } catch {
      // Not remembered; it still applies for this visit.
    }
  }, [preference]);

  // Send the latest position whenever a send is due. A timer decides when, not the position updates: a
  // phone standing still reports rarely, and a send skipped for being too soon would otherwise wait for
  // a new position that may not come.
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => {
      const current = fixRef.current;
      if (!current || sendingRef.current || current.accuracy > MAX_ACCURACY_M) return;
      const gap = current.speed !== null && current.speed > MOVING_SPEED_MS ? MOVING_GAP_MS : STILL_GAP_MS;
      if (Date.now() - lastSentRef.current < gap) return;
      lastSentRef.current = Date.now();
      sendingRef.current = true;
      const update = { lat: current.point[1], lon: current.point[0], radiusM: radiusRef.current, accuracy: current.accuracy };
      void sendRealtime<FloodAheadAck>("location:update", update).then((ack) => {
        sendingRef.current = false;
        if (!ack) {
          // Not connected yet, or no answer: try again on the next tick, not after the full gap.
          lastSentRef.current = 0;
          setSendIssue("offline");
        } else if (ack.ok) {
          setSendIssue(null);
          setLastCheck({ at: Date.now(), floodsNearby: ack.floodsNearby ?? 0, nearestM: ack.nearestM ?? null });
        } else if (ack.reason === "inaccurate") setSendIssue("inaccurate");
        else if (ack.reason !== "too-fast") setSendIssue("unavailable");
      });
    }, SEND_CHECK_MS);
    return () => window.clearInterval(timer);
  }, [enabled]);

  // The server says the person has come within a new distance of a flood.
  useRealtimeEvent<{ warnings?: FloodAheadWarning[] }>("flood:ahead", ({ warnings: incoming }) => {
    if (!enabled || !incoming?.length) return;
    setWarnings((current) => mergeWarnings(current, incoming));
    const nearest = incoming[0]!;
    navigator.vibrate?.([300, 150, 300, 150, 300]);
    if (document.visibilityState === "hidden") void showSystemNotification(describeWarning(nearest), `flood-ahead:${warningKey(nearest)}`);
  });

  const turnOn = useCallback(() => {
    if (!SUPPORTED) return;
    // Asked here, as the person presses the button, so the browser will show its prompt.
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
    lastSentRef.current = 0;
    setSendIssue(null);
    setPreference((current) => ({ ...current, enabled: true }));
  }, []);

  const turnOff = useCallback(() => {
    setPreference((current) => ({ ...current, enabled: false }));
    setSendIssue(null);
    setLastCheck(null);
    setWarnings([]);
  }, []);

  const setRadius = useCallback((metres: number) => {
    lastSentRef.current = 0; // check again at once with the new distance
    setPreference((current) => ({ ...current, radiusM: metres }));
  }, []);

  const dismiss = useCallback(() => setWarnings([]), []);

  const value = useMemo<FloodAheadContextValue>(
    () => ({ supported: SUPPORTED, enabled, radiusM, problem, issue, accuracyM, lastCheck, warnings, turnOn, turnOff, setRadius, dismiss }),
    [enabled, radiusM, problem, issue, accuracyM, lastCheck, warnings, turnOn, turnOff, setRadius, dismiss],
  );
  return <FloodAheadContext.Provider value={value}>{children}</FloodAheadContext.Provider>;
}
