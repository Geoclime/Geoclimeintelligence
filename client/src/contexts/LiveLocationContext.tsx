import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { fixOf } from "../utils/gps";
import type { Fix } from "../utils/survey-geometry";

/** A position from the device, with how fast it is moving (metres a second) when the device knows. */
export interface LiveFix extends Fix {
  speed: number | null;
}

export interface LiveLocationValue {
  /** The newest position, or null before the first one, or while nothing is following. */
  fix: LiveFix | null;
  /** The browser's error code when the device can't give a position (1 blocked, 2 unavailable, 3 timed out), else null. */
  errorCode: number | null;
  /** Asks for the position to be followed until the function this returns is called. Callers share one GPS watch. */
  follow: () => () => void;
}

export const LiveLocationContext = createContext<LiveLocationValue | null>(null);

/**
 * The one place the device's GPS is watched. Whatever wants the position as the person moves (the map's
 * "Follow me", flood warnings) asks to follow it with useLiveLocation; the watch runs while at least one
 * is following, so two features cost one GPS, not two, and none runs when nobody asks. The position
 * lives in memory here, is dropped when the last follower stops, and is never sent anywhere by this: a
 * feature that sends it says so (flood warnings do; Follow me does not).
 */
export function LiveLocationProvider({ children }: { children: ReactNode }) {
  const [followers, setFollowers] = useState(0);
  const [fix, setFix] = useState<LiveFix | null>(null);
  const [errorCode, setErrorCode] = useState<number | null>(null);
  const watching = followers > 0;

  const follow = useCallback(() => {
    let released = false;
    setFollowers((n) => n + 1);
    return () => {
      if (released) return;
      released = true;
      setFollowers((n) => Math.max(0, n - 1));
    };
  }, []);

  useEffect(() => {
    if (!watching || typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setErrorCode(null);
        setFix({ ...fixOf(position), speed: position.coords.speed });
      },
      (failure) => setErrorCode(failure.code),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 },
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      setFix(null);
      setErrorCode(null);
    };
  }, [watching]);

  const value = useMemo(() => ({ fix, errorCode, follow }), [fix, errorCode, follow]);
  return <LiveLocationContext.Provider value={value}>{children}</LiveLocationContext.Provider>;
}
