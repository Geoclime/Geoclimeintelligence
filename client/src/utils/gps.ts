import type { Fix } from "./survey-geometry";

/** What to tell someone whose device couldn't give a position, by the browser's own error code. */
const MESSAGES: Record<number, string> = {
  1: "Location permission was denied. Allow it in your browser's site settings, or tap the map instead.",
  2: "Your device couldn't work out where you are right now.",
  3: "Finding your location took too long. Try again, or tap the map instead.",
};

export const NO_GPS_MESSAGE = "This browser can't share its location. Tap the map instead.";

export function describeGpsError(error: Pick<GeolocationPositionError, "code">): string {
  return MESSAGES[error.code] ?? "Your location isn't available.";
}

/** A browser position as the recorder holds it: [longitude, latitude] and how sure the device is, in metres. */
export function fixOf(position: Pick<GeolocationPosition, "coords">): Fix {
  return { point: [position.coords.longitude, position.coords.latitude], accuracy: position.coords.accuracy };
}
