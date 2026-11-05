import { useEffect } from "react";

/**
 * Keeps the screen on while `active`: a walk that loses its GPS every time the phone sleeps is no
 * walk at all. A phone takes the lock back when the app goes to the background, so it is asked for
 * again when the app returns. A browser that can't, or won't, just lets the screen sleep.
 */
export function useScreenAwake(active: boolean) {
  useEffect(() => {
    if (!active || !navigator.wakeLock) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;

    const take = async () => {
      if (lock && !lock.released) return;
      try {
        const granted = await navigator.wakeLock.request("screen");
        if (stopped) void granted.release();
        else lock = granted;
      } catch {
        // Refused (low battery, or a browser setting): the walk carries on.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void take();
    };

    void take();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
