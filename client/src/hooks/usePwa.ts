import { useSyncExternalStore } from "react";
import { applyUpdate, dismissUpdate, getSnapshot, install, subscribe } from "../pwa/pwa-store";

/** Whether the app can be installed or has an update waiting, and the actions for both. */
export function usePwa() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { ...state, install, applyUpdate, dismissUpdate };
}
