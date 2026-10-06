import type { IdentitySession } from "../types/auth.types";
import type { IdentityClient } from "./identity";
import { EMAIL_NOT_VERIFIED, identityErrorFromCode } from "./identity-error";

/**
 * An offline stand-in for Firebase, used ONLY when the app runs in e2e mode (`vite --mode e2e`,
 * which Cypress drives). It lets specs exercise sign-in without a live call to a real identity
 * provider (standard section 21). Production builds never include it: see identity.ts.
 *
 * The session lives in localStorage under E2E_SESSION_KEY so `cy.login(role)` can seed it before
 * the app loads. Holding a fake session is harmless: the fake token it hands out means nothing
 * to a real backend, and in e2e mode every API call is stubbed by cy.intercept() anyway.
 *
 * Like the real thing, an account is only signed in once its email is verified, and signUp never
 * signs anyone in.
 *
 * Deterministic outcomes, so specs can drive the error paths:
 *   - signIn with password "wrong-password"      -> auth/invalid-credential
 *   - signIn with email "unverified@example.com" -> EMAIL_NOT_VERIFIED, no session
 *   - signUp with email "taken@example.com"      -> auth/email-already-in-use
 *   - signUp with email "no-mail@example.com"    -> account created, verification email fails
 *   - any other input                            -> success
 */
export const E2E_SESSION_KEY = "e2e:identity-session";
export const E2E_ID_TOKEN = "e2e-id-token";
export const E2E_UNVERIFIED_EMAIL = "unverified@example.com";

export function createE2eIdentity(): IdentityClient {
  const listeners = new Set<(session: IdentitySession | null) => void>();

  const read = (): IdentitySession | null => {
    const raw = window.localStorage.getItem(E2E_SESSION_KEY);
    return raw ? (JSON.parse(raw) as IdentitySession) : null;
  };

  const write = (session: IdentitySession | null) => {
    if (session) window.localStorage.setItem(E2E_SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(E2E_SESSION_KEY);
    listeners.forEach((listener) => listener(session));
  };

  const sessionFor = (email: string): IdentitySession => ({
    uid: `e2e-${email.toLowerCase()}`,
    email: email.toLowerCase(),
  });

  const isUnverified = (email: string) => email.toLowerCase() === E2E_UNVERIFIED_EMAIL;

  return {
    onSessionChanged(listener) {
      listeners.add(listener);
      // Like Firebase, report the restored session asynchronously, not during subscribe.
      queueMicrotask(() => listener(read()));
      return () => listeners.delete(listener);
    },
    async getIdToken() {
      return read() ? E2E_ID_TOKEN : null;
    },
    async signIn(email, password) {
      if (password === "wrong-password") throw identityErrorFromCode("auth/invalid-credential");
      if (isUnverified(email)) throw identityErrorFromCode(EMAIL_NOT_VERIFIED);
      write(sessionFor(email));
    },
    async signUp(email) {
      if (email.toLowerCase() === "taken@example.com") throw identityErrorFromCode("auth/email-already-in-use");
      return { verificationSent: email.toLowerCase() !== "no-mail@example.com" };
    },
    async sendPasswordReset() {},
    async resendVerificationEmail(email, password) {
      if (password === "wrong-password") throw identityErrorFromCode("auth/invalid-credential");
      if (isUnverified(email)) return true;
      write(sessionFor(email));
      return false;
    },
    async signOut() {
      write(null);
    },
  };
}
