/** Mirrors USER_ROLES in server/src/common/access/roles.ts: the five built-in roles. Keep the order identical. */
export const USER_ROLES = [
  "general_public",
  "emergency_responder",
  "government_official",
  "researcher",
  "administrator",
] as const;
export type BuiltInRole = (typeof USER_ROLES)[number];
/** A built-in role, or one an administrator created on the Roles screen. */
export type UserRole = BuiltInRole | (string & {});

/** Mirrors PERMISSION_INFO in server/src/common/access/permissions.ts: what a role may be given. */
export const PERMISSIONS = [
  "survey.record_flood",
  "survey.recede_flood",
  "survey.record_drain",
  "survey.inspect_drain",
  "survey.delete_own",
  "survey.delete_any",
  "survey.view_people",
  "drainage.import",
  "photos.add",
  "photos.view",
  "photos.delete_any",
  "places.manage",
  "households.view",
  "reports.review",
  "alerts.issue",
  "ai.use",
  "ai.own_keys",
  "audit.view",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/** Mirrors REGION_SCOPABLE_ROLES on the backend: only these roles may carry a region scope. */
export const REGION_SCOPABLE_ROLES: readonly UserRole[] = ["emergency_responder", "government_official"];

/** Mirrors REQUESTABLE_ROLES on the backend: the roles a user may ask an administrator for. */
export const REQUESTABLE_ROLES = ["emergency_responder", "government_official", "researcher"] as const;
export type RequestableRole = (typeof REQUESTABLE_ROLES)[number];

/** An open request for a staff role. It grants nothing until an administrator approves it. */
export interface RoleRequest {
  role: RequestableRole;
  reason: string;
  requestedAt: string;
}

/** Body for PUT /api/v1/auth/me/role-request. The organisation and job title are saved to the profile. */
export interface RoleRequestBody {
  role: RequestableRole;
  reason: string;
  organisation?: string | null;
  jobTitle?: string | null;
}

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
  /** What their role may do (the Roles screen). Absent from an older backend: then the built-in defaults apply. */
  permissions?: Permission[];
  /** Self-service profile details. Optional so an older backend without them still works. */
  phone?: string | null;
  organisation?: string | null;
  jobTitle?: string | null;
  /** The user's open request for a staff role; null or absent when there is none. */
  roleRequest?: RoleRequest | null;
  /** The LGA they live or work in: decides which flood alerts reach them. */
  homeAdminUnitId?: string | null;
  /** The ward inside that LGA, if they chose one: lets an alert for just their ward reach them. */
  homeWardId?: string | null;
  /**
   * Name, phone and home area are filled in. False sends them to "Finish setting up" before
   * anything else; absent (an older backend) counts as complete.
   */
  profileComplete?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Body for PATCH /api/v1/auth/me. Role and scope can't be changed here. Organisation and job title
 * can be cleared with null; name, phone and home area can be changed but never cleared.
 */
export interface ProfilePatch {
  displayName?: string | null;
  phone?: string | null;
  organisation?: string | null;
  jobTitle?: string | null;
  homeAdminUnitId?: string | null;
  /** Optional; null clears it. Must be a ward inside the home LGA. */
  homeWardId?: string | null;
}

/**
 * What the identity provider (Firebase) knows about the person signed in on this device.
 * It proves who they are; it says nothing about what they may do. See AuthUser for that.
 * A session only exists once the account's email is verified, so there is no flag for it.
 */
export interface IdentitySession {
  uid: string;
  email: string | null;
}
