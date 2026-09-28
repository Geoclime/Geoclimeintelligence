import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { env } from "../config/env";
import type { IdentitySession } from "../types/auth.types";
import { CONTINUE_PATHS, continueSettings, sendWithContinueUrl } from "./email-actions";
import type { IdentityClient } from "./identity";
import { toIdentityError } from "./identity-error";

/**
 * The only file in the client that talks to the Firebase Auth SDK. The SDK persists the
 * session in IndexedDB and refreshes the ID token before it expires; this wrapper only asks
 * it for things. It never reads, writes or decodes a token itself (standard section 19.3).
 */
export function createFirebaseIdentity(): IdentityClient {
  const app = initializeApp({
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  });
  const auth = getAuth(app);
  // Account emails always go out in English: the app and our customised email templates are
  // English-only, and another language code could make Firebase send its own generic
  // translation instead (docs/features/auth-email-templates.md).
  auth.languageCode = "en";

  const toSession = (user: User | null): IdentitySession | null =>
    user ? { uid: user.uid, email: user.email, emailVerified: user.emailVerified } : null;

  /** Runs a Firebase call and converts any rejection into a user-safe IdentityError. */
  async function call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw toIdentityError(error);
    }
  }

  return {
    onSessionChanged(listener) {
      return onIdTokenChanged(auth, (user) => listener(toSession(user)));
    },

    async getIdToken(forceRefresh = false) {
      // Cheap: the SDK returns its cached token unless it is close to expiry or forced.
      return auth.currentUser ? auth.currentUser.getIdToken(forceRefresh) : null;
    },

    async signIn(email, password) {
      await call(() => signInWithEmailAndPassword(auth, email, password));
    },

    async signUp(email, password) {
      const { user } = await call(() => createUserWithEmailAndPassword(auth, email, password));
      // Best effort: the account exists either way, and the user can resend from the overview.
      await sendWithContinueUrl(
        (settings) => sendEmailVerification(user, settings),
        continueSettings(CONTINUE_PATHS.verifyEmail),
      ).catch(() => undefined);
    },

    async sendPasswordReset(email) {
      try {
        await sendWithContinueUrl(
          (settings) => sendPasswordResetEmail(auth, email, settings),
          continueSettings(CONTINUE_PATHS.resetPassword),
        );
      } catch (error) {
        const identityError = toIdentityError(error);
        // Never reveal whether an account exists: an unknown email looks exactly like success.
        if (identityError.code === "auth/user-not-found") return;
        throw identityError;
      }
    },

    async sendEmailVerification() {
      const user = auth.currentUser;
      if (!user) return;
      await call(() =>
        sendWithContinueUrl(
          (settings) => sendEmailVerification(user, settings),
          continueSettings(CONTINUE_PATHS.verifyEmail),
        ),
      );
    },

    async refreshSession() {
      const user = auth.currentUser;
      if (!user || user.emailVerified) return;
      await call(() => user.reload());
      // reload() updates the user object but notifies no listener. Forcing a new ID token does
      // (onIdTokenChanged), which is how AuthContext learns the email is now verified.
      if (user.emailVerified) await call(() => user.getIdToken(true));
    },

    async signOut() {
      await call(() => signOut(auth));
    },
  };
}
