import { useCallback, useState } from "react";

/** Per-device convenience, like the theme: it lives in localStorage, never in API data (standard section 14). */
export const SIDEBAR_COLLAPSED_KEY = "geoclime:sidebar-collapsed";

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    // Storage can be blocked (private mode, strict privacy settings). Start expanded.
    return false;
  }
}

/**
 * Whether the wide-screen sidebar is collapsed to its icon rail, remembered between visits.
 * Phones and tablets use a drawer instead, which this never affects.
 */
export function useSidebarCollapsed(): [collapsed: boolean, toggle: () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  const toggle = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      try {
        if (next) window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "true");
        else window.localStorage.removeItem(SIDEBAR_COLLAPSED_KEY);
      } catch {
        // Not persisted; the choice still applies for this visit.
      }
      return next;
    });
  }, []);

  return [collapsed, toggle];
}
