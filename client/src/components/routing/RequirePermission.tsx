import { Link, Outlet } from "react-router";
import { useCan } from "../../hooks/useCan";
import type { Permission } from "../../types/auth.types";
import { MAP_PATH } from "../../utils/map-url";
import { buttonClassName } from "../shared/Button";
import { EmptyState } from "../shared/EmptyState";

/**
 * Hides a screen from roles that don't hold the permission it needs (the Roles screen sets them).
 * A convenience, not a security boundary: the backend refuses the same requests whatever the UI does.
 */
export function RequirePermission({ permission }: { permission: Permission }) {
  const can = useCan();
  if (!can(permission)) {
    return (
      <div className="page" data-cy="forbidden">
        <EmptyState
          icon="lock"
          title="You don't have access to this page"
          message="Your account's role doesn't include this area. If you think it should, ask an administrator to review your access."
          action={
            <Link to={MAP_PATH} className={buttonClassName({ variant: "secondary" })}>
              Back to the map
            </Link>
          }
        />
      </div>
    );
  }
  return <Outlet />;
}
