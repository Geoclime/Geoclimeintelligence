import { useEffect, useState } from "react";

/**
 * The value, once it has stopped changing for `delayMs`. Used for search boxes and for the map's
 * bounding box (300 ms, standard sections 7 and 10), so a request fires when typing or panning
 * settles rather than on every keystroke or frame.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
