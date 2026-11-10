import { useCallback, useState } from "react";
import { describeGpsError, NO_GPS_MESSAGE } from "../utils/gps";
import { useLiveLocation } from "./useLiveLocation";
import { useScreenAwake } from "./useScreenAwake";

const SUPPORTED = typeof navigator !== "undefined" && "geolocation" in navigator;

/**
 * The map's "Follow me": the blue dot moves as you walk, and the map keeps you in view. Two separate
 * things, so looking elsewhere on the map doesn't lose where you are: `following` is the position being
 * tracked and drawn; `centring` is the map being panned to it, and stops when you move the map by hand
 * (`release`) until you ask for it back (`recentre`). The position stays in this browser: nothing is
 * sent anywhere. The screen is kept awake while following, since a phone stops sharing its position once
 * the screen locks.
 */
export function useFollowMe() {
  const [following, setFollowing] = useState(false);
  const [centring, setCentring] = useState(true);
  const { fix, errorCode } = useLiveLocation(following);
  useScreenAwake(following);

  const toggle = useCallback(() => {
    setFollowing((on) => !on);
    setCentring(true);
  }, []);
  const recentre = useCallback(() => setCentring(true), []);
  const release = useCallback(() => setCentring(false), []);

  let error: string | null = null;
  if (!SUPPORTED) error = NO_GPS_MESSAGE;
  else if (errorCode !== null) error = describeGpsError({ code: errorCode });

  return {
    supported: SUPPORTED,
    following,
    centring,
    fix,
    error,
    /** On, but no position has arrived yet. */
    waiting: following && !fix && error === null,
    toggle,
    recentre,
    release,
  };
}
