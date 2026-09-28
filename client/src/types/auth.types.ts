/** Mirrors USER_ROLES in server/src/common/access/roles.ts. Keep the order identical. */
export const USER_ROLES = [
  "general_public",
  "emergency_responder",
  "government_official",
  "researcher",
  "administrator",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Mirrors REGION_SCOPABLE_ROLES on the backend: only these roles may carry a region scope. */
export const REGION_SCOPABLE_ROLES: readonly UserRole[] = ["emergency_responder", "government_official"];

/**
 * The backend's view of the signed-in user, from GET /api/v1/auth/me. Mirrors AuthUser in
 * server/src/common/access/auth-user.ts. Role and scope live in Postgres, never in the
 * Firebase token, which is why the client has to ask for them (standard section 12).
 */
export interface AuthUser {
  id: string;
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  /** null = unrestricted; otherwise the admin unit (and its descendants) this user may act on. */
  scopeAdminUnitId: string | null;
}

/**
 * What the identity provider (Firebase) knows about the person signed in on this device.
 * It proves who they are; it says nothing about what they may do. See AuthUser for that.
 */
export interface IdentitySession {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}
