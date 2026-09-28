import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../../hooks/useAuth";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import { SessionErrorState } from "./SessionErrorState";

/** Location state passed to /sign-in, so the user returns where they were headed afterwards. */
export interface RedirectState {
  from?: string;
}

/**
 * Guards every signed-in route. It only decides what to SHOW: the backend rejects any request
 * without a valid token no matter what this component does.
 */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <LoadingSpinner fullPage message="Checking your session…" />;
  if (status === "error") return <SessionErrorState />;
  if (status === "signed-out") {
    const state: RedirectState = { from: `${location.pathname}${location.search}` };
    return <Navigate to="/sign-in" replace state={state} />;
  }
  return <Outlet />;
}
