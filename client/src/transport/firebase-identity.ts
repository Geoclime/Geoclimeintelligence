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
  // Verification and password-reset emails go out in the browser's language.
  auth.useDeviceLanguage();

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
      await sendEmailVerification(user).catch(() => undefined);
    },

    async sendPasswordReset(email) {
      try {
        await sendPasswordResetEmail(auth, email);
      } catch (error) {
        const identityError = toIdentityError(error);
        // Never reveal whether an account exists: an unknown email looks exactly like success.
        if (identityError.code === "auth/user-not-found") return;
        throw identityError;
      }
    },

    async sendEmailVerification() {
      const user = auth.currentUser;
      if (user) await call(() => sendEmailVerification(user));
    },

    async signOut() {
      await call(() => signOut(auth));
    },
  };
}
