import { IS_E2E } from "../config/env";
import type { IdentitySession } from "../types/auth.types";
import { createE2eIdentity } from "./e2e-identity";
import { createFirebaseIdentity } from "./firebase-identity";

/**
 * Everything the app needs from an identity provider, in one small interface. The real
 * implementation is a thin wrapper over the Firebase Web SDK (firebase-identity.ts). The SDK
 * owns the session, its storage and token refresh; nothing here ever stores or parses a token
 * (standard sections 5 and 19.3).
 *
 * The interface exists so Cypress can swap in an offline fake (e2e-identity.ts) and never
 * sign in against a real Firebase project (standard section 21).
 */
export interface IdentityClient {
  /**
   * Calls `listener` with the current session straight away, and again every time it changes:
   * sign-in, sign-out, and each ID-token refresh (Firebase's onIdTokenChanged). Returns an
   * unsubscribe function.
   */
  onSessionChanged(listener: (session: IdentitySession | null) => void): () => void;
  /** The current ID token, or null when signed out. `forceRefresh` asks Firebase for a new one. */
  getIdToken(forceRefresh?: boolean): Promise<string | null>;
  /** Every method below rejects with an IdentityError carrying a user-safe message. */
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  sendEmailVerification(): Promise<void>;
  /**
   * Re-reads an unverified account from the provider, and fires onSessionChanged if its email
   * has been verified since (for example, from the link in another tab or on a phone).
   * Does nothing when signed out or already verified.
   */
  refreshSession(): Promise<void>;
  signOut(): Promise<void>;
}

// Vite replaces import.meta.env.MODE at build time, so a production bundle contains only the
// Firebase branch; the fake is dropped as dead code (checked in docs/features/e2e-testing.md).
export const identity: IdentityClient = IS_E2E ? createE2eIdentity() : createFirebaseIdentity();
