import { REGION_SCOPABLE_ROLES, type UserRole } from "../types/auth.types";

interface RoleInfo {
  label: string;
  /** Plain-language summary, matching the `roles` table seeded by the backend's Phase 1 migration. */
  description: string;
}

export const ROLE_INFO: Record<UserRole, RoleInfo> = {
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

export function roleLabel(role: UserRole): string {
  return ROLE_INFO[role].label;
}

export function isRegionScopable(role: UserRole): boolean {
  return REGION_SCOPABLE_ROLES.includes(role);
}

/**
 * Mirrors the backend's authorise(): Administrators pass every role check. This only decides
 * what the UI shows. The backend enforces the same rule on every request regardless.
 */
export function hasAnyRole(role: UserRole, allowed: readonly UserRole[]): boolean {
  return role === "administrator" || allowed.includes(role);
}
