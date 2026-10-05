import type { UserRole } from "./roles";

/**
 * The signed-in user as every middleware and service sees it (`req.user`). Identity comes
 * from Firebase; role and region scope come from our own `users` table (section 7).
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

/** The identity Firebase vouches for after an ID token is verified. */
export interface VerifiedIdentity {
  uid: string;
  email: string | null;
  /** Firebase has confirmed the person controls this email address. */
  emailVerified: boolean;
  name: string | null;
}
