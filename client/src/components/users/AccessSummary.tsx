import type { AdminUnitRef } from "../../types/admin-unit.types";
import type { AuthUser } from "../../types/auth.types";
import { ROLE_INFO, isRegionScopable } from "../../utils/roles";
import { Icon } from "../shared/Icon";
import { RoleBadge } from "./RoleBadge";
import "./users.css";

interface AccessSummaryProps {
  user: AuthUser;
  /** The area a scoped account is limited to, looked up by the page; null until known. */
  region?: AdminUnitRef | null;
  regionLoading?: boolean;
}

/** "What can I do, and where?" for the signed-in user, straight from GET /api/v1/auth/me. */
export function AccessSummary({ user, region = null, regionLoading = false }: AccessSummaryProps) {
  return (
    <section className="card access-summary" aria-labelledby="access-summary-title" data-cy="access-summary">
      <header className="access-summary__header">
        <span className="access-summary__icon">
          <Icon name="shield" size={20} />
        </span>
        <h2 id="access-summary-title" className="access-summary__title">
          Your access
        </h2>
      </header>

      <dl className="access-summary__list">
        <div>
          <dt>Role</dt>
          <dd>
            <RoleBadge role={user.role} />
            <p className="access-summary__note">{ROLE_INFO[user.role].description}</p>
          </dd>
        </div>
        <div>
          <dt>Region</dt>
          <dd data-cy="access-region">
            {user.scopeAdminUnitId ? (
              <>
                <span className="access-summary__value">
                  Limited to one region
                  {region ? `: ${region.unitName} (${region.levelName})` : ""}
                </span>
                <p className="access-summary__note">
                  {region
                    ? `This account can act on records in ${region.unitName} and the areas inside it.`
                    : regionLoading
                      ? "Looking up the region name…"
                      : `Region ID ${user.scopeAdminUnitId}. Its name isn't available.`}
                </p>
              </>
            ) : (
              <>
                <span className="access-summary__value">All of Rivers State</span>
                {isRegionScopable(user.role) && (
                  <p className="access-summary__note">No region restriction has been set for this account.</p>
                )}
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>Email</dt>
          <dd className="access-summary__value">{user.email ?? "Not available"}</dd>
        </div>
      </dl>
    </section>
  );
}
