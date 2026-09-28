import { Navigate, Outlet, useLocation } from "react-router";
import { useAuth } from "../../hooks/useAuth";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import type { RedirectState } from "./RequireAuth";
import { SessionErrorState } from "./SessionErrorState";

/** Only accept same-app paths, so a crafted link can't bounce a user to another site. */
function safeRedirect(state: unknown): string {
  const from = (state as RedirectState | null)?.from;
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/";
}

/**
 * Wraps the sign-in, sign-up and password-reset pages. Once someone is signed in (for example,
 * right after submitting the sign-in form) it sends them on to where they were headed.
 */
export function GuestOnly() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <LoadingSpinner fullPage message="Checking your session…" />;
  if (status === "error") return <SessionErrorState />;
  if (status === "signed-in") return <Navigate to={safeRedirect(location.state)} replace />;
  return <Outlet />;
}
