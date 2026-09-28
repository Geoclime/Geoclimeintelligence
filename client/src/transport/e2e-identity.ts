import type { IdentitySession } from "../types/auth.types";
import type { IdentityClient } from "./identity";
import { identityErrorFromCode } from "./identity-error";

/**
 * An offline stand-in for Firebase, used ONLY when the app runs in e2e mode (`vite --mode e2e`,
 * which Cypress drives). It lets specs exercise sign-in without a live call to a real identity
 * provider (standard section 21). Production builds never include it: see identity.ts.
 *
 * The session lives in localStorage under E2E_SESSION_KEY so `cy.login(role)` can seed it before
 * the app loads. Holding a fake session is harmless: the fake token it hands out means nothing
 * to a real backend, and in e2e mode every API call is stubbed by cy.intercept() anyway.
 *
 * Deterministic outcomes, so specs can drive the error paths:
 *   - signIn with password "wrong-password"      -> auth/invalid-credential
 *   - signUp with email "taken@example.com"      -> auth/email-already-in-use
 *   - any other input                            -> success
 */
export const E2E_SESSION_KEY = "e2e:identity-session";
export const E2E_ID_TOKEN = "e2e-id-token";

export function createE2eIdentity(): IdentityClient {
  const listeners = new Set<(session: IdentitySession | null) => void>();
  let lastNotified: IdentitySession | null = null;

  const read = (): IdentitySession | null => {
    const raw = window.localStorage.getItem(E2E_SESSION_KEY);
    return raw ? (JSON.parse(raw) as IdentitySession) : null;
  };

  const write = (session: IdentitySession | null) => {
    if (session) window.localStorage.setItem(E2E_SESSION_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(E2E_SESSION_KEY);
    lastNotified = session;
    listeners.forEach((listener) => listener(session));
  };

  const sessionFor = (email: string): IdentitySession => ({
    uid: `e2e-${email.toLowerCase()}`,
    email: email.toLowerCase(),
    emailVerified: true,
  });

  return {
    onSessionChanged(listener) {
      listeners.add(listener);
      // Like Firebase, report the restored session asynchronously, not during subscribe.
      queueMicrotask(() => {
        lastNotified = read();
        listener(lastNotified);
      });
      return () => listeners.delete(listener);
    },
    async getIdToken() {
      return read() ? E2E_ID_TOKEN : null;
    },
    async signIn(email, password) {
      if (password === "wrong-password") throw identityErrorFromCode("auth/invalid-credential");
      write(sessionFor(email));
    },
    async signUp(email) {
      if (email.toLowerCase() === "taken@example.com") throw identityErrorFromCode("auth/email-already-in-use");
      write({ ...sessionFor(email), emailVerified: false });
    },
    async sendPasswordReset() {},
    async sendEmailVerification() {},
    async refreshSession() {
      // Specs "verify" an email by editing the stored session; like Firebase, notify only when
      // an unverified session has become verified.
      const session = read();
      if (session?.emailVerified && lastNotified && !lastNotified.emailVerified) {
        listeners.forEach((listener) => listener(session));
        lastNotified = session;
      }
    },
    async signOut() {
      write(null);
    },
  };
}
