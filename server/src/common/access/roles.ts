import { ValidationError } from "../errors/app-error";

/**
 * The five built-in platform roles (section 7). Stored as `users.role`, a FK to `roles.code`. An
 * administrator can create more on the Roles screen (modules/roles), so a user's role is any role
 * code; what it may do is a set of permissions (common/access/permissions.ts), never its name.
 */
export const USER_ROLES = [
  "general_public",
  "emergency_responder",
  "government_official",
  "researcher",
  "administrator",
] as const;
export type BuiltInRole = (typeof USER_ROLES)[number];
/** A built-in role, or one an administrator created. `(string & {})` keeps the built-in names suggested. */
export type UserRole = BuiltInRole | (string & {});

export function isBuiltInRole(code: string): code is BuiltInRole {
  return (USER_ROLES as readonly string[]).includes(code);
}

/** Every account starts here; only an Administrator can raise it. */
export const DEFAULT_ROLE: UserRole = "general_public";

/**
 * Roles a user may ask an administrator for (a role request). Never administrator, and never
 * the default role everyone already has. The users table's CHECK constraint matches this list.
 */
export const REQUESTABLE_ROLES = ["emergency_responder", "government_official", "researcher"] as const;
export type RequestableRole = (typeof REQUESTABLE_ROLES)[number];

/** The built-in roles that may be restricted to an area as seeded (roles.can_be_scoped can change it). */
export const REGION_SCOPABLE_ROLES: readonly UserRole[] = ["emergency_responder", "government_official"];

/**
 * Only a role that allows it (`roles.can_be_scoped`: responders and officials as seeded, and any role an
 * administrator set so) can carry a region scope; every other role must have `scopeAdminUnitId: null`.
 * The database enforces the same rule with a trigger, so this is the first of two gates.
 */
export function assertScopeAllowedForRole(role: { code: string; name?: string; canBeScoped: boolean }, scopeAdminUnitId: string | null): void {
  if (scopeAdminUnitId !== null && !role.canBeScoped) {
    throw new ValidationError([
      {
        field: "scopeAdminUnitId",
        message: `The ${role.name ?? role.code} role can't be limited to an area: send null, or allow it on the Roles screen first`,
      },
    ]);
  }
}
