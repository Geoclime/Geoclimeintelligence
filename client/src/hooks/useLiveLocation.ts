import { useContext, useEffect } from "react";
import { LiveLocationContext, type LiveFix } from "../contexts/LiveLocationContext";

/**
 * The device's position as the person moves, while `active`. Turning `active` on starts following (the
 * browser asks permission the first time); turning it off, or leaving the screen, stops, and the GPS is
 * released once nobody is following. When not `active` this returns nothing, so a feature that is off
 * never sees the position another feature is following.
 */
export function useLiveLocation(active: boolean): { fix: LiveFix | null; errorCode: number | null } {
  const context = useContext(LiveLocationContext);
  if (!context) throw new Error("useLiveLocation must be used inside <LiveLocationProvider>");
  const { follow } = context;
  useEffect(() => (active ? follow() : undefined), [active, follow]);
  return active ? { fix: context.fix, errorCode: context.errorCode } : { fix: null, errorCode: null };
}
