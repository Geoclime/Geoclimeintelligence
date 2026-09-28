import { Link, Outlet } from "react-router";
import { useAuth } from "../../hooks/useAuth";
import type { UserRole } from "../../types/auth.types";
import { hasAnyRole } from "../../utils/roles";
import { buttonClassName } from "../shared/Button";
import { EmptyState } from "../shared/EmptyState";

interface RequireRoleProps {
  /** Administrators always pass, mirroring the backend's authorise(). */
  roles: readonly UserRole[];
}

/**
 * Hides screens a role can't use. A convenience, not a security boundary: the backend's
 * authorise() returns 403 for the same routes whatever the UI does.
 */
export function RequireRole({ roles }: RequireRoleProps) {
  const { user } = useAuth();

  if (!user || !hasAnyRole(user.role, roles)) {
    return (
      <div className="page" data-cy="forbidden">
        <EmptyState
          icon="lock"
          title="You don't have access to this page"
          message="Your account's role doesn't include this area. If you think it should, ask an administrator to review your access."
          action={
            <Link to="/" className={buttonClassName({ variant: "secondary" })}>
              Back to overview
            </Link>
          }
        />
      </div>
    );
  }
  return <Outlet />;
}
