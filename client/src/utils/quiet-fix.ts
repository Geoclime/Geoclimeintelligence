/** Where the phone is, if it will say within a few seconds; null otherwise. Never asks twice or shows an error. */
export function quietFix(timeoutMs = 8_000): Promise<{ longitude: number; latitude: number; accuracyM: number } | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ longitude: position.coords.longitude, latitude: position.coords.latitude, accuracyM: position.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
    );
  });
}
