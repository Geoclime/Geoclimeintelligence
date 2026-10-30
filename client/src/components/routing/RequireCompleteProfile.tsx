import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../../hooks/useAuth";
import type { RedirectState } from "./RequireAuth";

/**
 * Sits inside RequireAuth, around the signed-in app. Someone whose profile is missing a required
 * detail (name, phone number, home area) is sent to "Finish setting up" first, and comes back to
 * where they were going afterwards. Like every guard, it only decides what to show: the API
 * refuses reports and requests from an unfinished profile on its own.
 */
export function RequireCompleteProfile() {
  const { user } = useAuth();
  const location = useLocation();
  if (user && user.profileComplete === false) {
    const state: RedirectState = { from: `${location.pathname}${location.search}${location.hash}` };
    return <Navigate to="/welcome" replace state={state} />;
  }
  return <Outlet />;
}
