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
   * unsubscribe function. An account whose email isn't verified is reported as `null`: the app
   * never sees, and never sends a token for, an unverified account.
   */
  onSessionChanged(listener: (session: IdentitySession | null) => void): () => void;
  /** The current ID token, or null when signed out. `forceRefresh` asks Firebase for a new one. */
  getIdToken(forceRefresh?: boolean): Promise<string | null>;
  /**
   * Every method below rejects with an IdentityError carrying a user-safe message. `signIn` also
   * rejects, with code EMAIL_NOT_VERIFIED and the user left signed out, when the password is right
   * but the email isn't verified yet.
   */
  signIn(email: string, password: string): Promise<void>;
  /**
   * Creates the account and emails a verification link, then signs straight back out: the new
   * account can't be used until the link has been clicked. `verificationSent` is false when the
   * account exists but the email couldn't be sent (the user can ask for another at sign-in).
   */
  signUp(email: string, password: string): Promise<{ verificationSent: boolean }>;
  sendPasswordReset(email: string): Promise<void>;
  /**
   * For someone who can't sign in because their email is unverified: checks the password, sends a
   * fresh verification link and signs out again. Resolves true when a link was sent. Resolves
   * false if the email turned out to be verified already, in which case they are now signed in.
   */
  resendVerificationEmail(email: string, password: string): Promise<boolean>;
  signOut(): Promise<void>;
}

// Vite replaces import.meta.env.MODE at build time, so a production bundle contains only the
// Firebase branch; the fake is dropped as dead code (checked in docs/features/e2e-testing.md).
export const identity: IdentityClient = IS_E2E ? createE2eIdentity() : createFirebaseIdentity();
