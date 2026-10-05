import { useCallback, useState } from "react";
import type { LonLat } from "../types/admin-unit.types";

const MESSAGES: Record<number, string> = {
  1: "Location permission was denied. Allow it in your browser's site settings to use this.",
  2: "Your device couldn't work out where you are right now.",
  3: "Finding your location took too long. Try again.",
};

/**
 * The browser's own location, asked for only when the user presses "Where am I?". The position
 * is used for one locate request and never stored or sent anywhere else.
 */
export function useGeolocation() {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(
    () =>
      new Promise<LonLat | null>((resolve) => {
        if (!("geolocation" in navigator)) {
          setError("This browser can't share its location.");
          resolve(null);
          return;
        }
        setLocating(true);
        setError(null);
        navigator.geolocation.getCurrentPosition(
          (position) => {
            setLocating(false);
            resolve([position.coords.longitude, position.coords.latitude]);
          },
          (failure) => {
            setLocating(false);
            setError(MESSAGES[failure.code] ?? "Your location isn't available.");
            resolve(null);
          },
          { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 },
        );
      }),
    [],
  );

  return { request, locating, error };
}
