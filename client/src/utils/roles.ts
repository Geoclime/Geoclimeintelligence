import { REGION_SCOPABLE_ROLES, type BuiltInRole, type RequestableRole, type UserRole } from "../types/auth.types";

interface RoleInfo {
  label: string;
  /** Plain-language summary, matching the `roles` table seeded by the backend's Phase 1 migration. */
  description: string;
}

export const ROLE_INFO: Record<BuiltInRole, RoleInfo> = {
  general_public: {
    label: "General Public",
    description: "Read published disaster events, risk layers and alerts. Read-only.",
  },
  emergency_responder: {
    label: "Emergency Responder",
    description: "Everything the public sees, plus creating and updating disaster reports in an assigned region.",
  },
  government_official: {
    label: "Government Official",
    description: "Responder access within an assigned region, plus analytics and dashboards.",
  },
  researcher: {
    label: "Researcher",
    description: "Read access to the full historical record, including data under review, and exports.",
  },
  administrator: {
    label: "Administrator",
    description: "Full access, including user management and data-source management. No region restriction.",
  },
};

/**
 * How each joining choice is described to someone signing up or asking for a role: who it is for,
 * not what it unlocks, since staff roles are confirmed by an administrator.
 */
export const JOINING_AS: Record<"general_public" | RequestableRole, { label: string; description: string }> = {
  general_public: { label: "Member of the public", description: "Explore the map, look up places and follow rainfall." },
  emergency_responder: { label: "Emergency responder", description: "Agencies, NGOs and volunteers who respond to incidents in an area." },
  government_official: { label: "Government official", description: "Ministries, agencies and LGA staff who plan and coordinate." },
  researcher: { label: "Researcher", description: "Universities and institutes studying climate, water and risk." },
};

/** "field_inspector" → "Field inspector": how a role an administrator made is named before its own name is known. */
function prettify(code: string): string {
  const words = code.replace(/_/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A role's name: a built-in role's own, or (for one made on the Roles screen) its name from the list of roles, if given. */
export function roleLabel(role: UserRole, roles?: readonly { code: string; name: string }[]): string {
  return roles?.find((item) => item.code === role)?.name ?? (role in ROLE_INFO ? ROLE_INFO[role as BuiltInRole].label : prettify(role));
}

/** A role's description, likewise. */
export function roleDescription(role: UserRole, roles?: readonly { code: string; description: string }[]): string {
  return roles?.find((item) => item.code === role)?.description ?? (role in ROLE_INFO ? ROLE_INFO[role as BuiltInRole].description : "A role an administrator created.");
}

/**
 * Whether a role's users may be limited to one area. The role list says (the Roles screen can change it);
 * without it, the built-in default applies.
 */
export function isRegionScopable(role: UserRole, roles?: readonly { code: string; canBeScoped: boolean }[]): boolean {
  return roles?.find((item) => item.code === role)?.canBeScoped ?? REGION_SCOPABLE_ROLES.includes(role);
}

/**
 * Mirrors the backend's authorise(): Administrators pass every role check. This only decides
 * what the UI shows. The backend enforces the same rule on every request regardless.
 */
export function hasAnyRole(role: UserRole, allowed: readonly UserRole[]): boolean {
  return role === "administrator" || allowed.includes(role);
}
