import { ValidationError } from "../errors/app-error";

/** The five platform roles (section 7). Stored as `users.role`, a FK to `roles.code`. */
export const USER_ROLES = [
  "general_public",
  "emergency_responder",
  "government_official",
  "researcher",
  "administrator",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Every account starts here; only an Administrator can raise it. */
export const DEFAULT_ROLE: UserRole = "general_public";

/** Staff roles that may be restricted to an admin unit via `scope_admin_unit_id`. */
export const REGION_SCOPABLE_ROLES: readonly UserRole[] = ["emergency_responder", "government_official"];

/**
 * Only Emergency Responders and Government Officials can carry a region scope; every other
 * role must have `scopeAdminUnitId: null`. The database enforces the same rule with a CHECK
 * constraint, so this is the first of two gates.
 */
export function assertScopeAllowedForRole(role: UserRole, scopeAdminUnitId: string | null): void {
  if (scopeAdminUnitId !== null && !REGION_SCOPABLE_ROLES.includes(role)) {
    throw new ValidationError([
      {
        field: "scopeAdminUnitId",
        message: `Only ${REGION_SCOPABLE_ROLES.join(" and ")} accounts can have a region scope; send null for role "${role}"`,
      },
    ]);
  }
}
