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
import { EMAIL_NOT_VERIFIED, identityErrorFromCode, toIdentityError } from "./identity-error";

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

  // Firebase signs a user in the moment their account is created or their password is accepted,
  // verified or not. So the gate is here: an unverified account is reported as "no session", which
  // keeps the app from ever asking the backend about it (see signIn and signUp below).
  const toSession = (user: User | null): IdentitySession | null =>
    user?.emailVerified ? { uid: user.uid, email: user.email } : null;

  /** Runs a Firebase call and converts any rejection into a user-safe IdentityError. */
  async function call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw toIdentityError(error);
    }
  }

  /** Best effort: if signing out fails, toSession still hides the unverified account from the app. */
  const signOutQuietly = () => signOut(auth).catch(() => undefined);

  const sendVerification = (user: User) =>
    sendWithContinueUrl(
      (settings) => sendEmailVerification(user, settings),
      continueSettings(CONTINUE_PATHS.verifyEmail),
    );

  return {
    onSessionChanged(listener) {
      return onIdTokenChanged(auth, (user) => listener(toSession(user)));
    },

    async getIdToken(forceRefresh = false) {
      // Cheap: the SDK returns its cached token unless it is close to expiry or forced.
      return auth.currentUser ? auth.currentUser.getIdToken(forceRefresh) : null;
    },

    async signIn(email, password) {
      const { user } = await call(() => signInWithEmailAndPassword(auth, email, password));
      if (!user.emailVerified) {
        await signOutQuietly();
        throw identityErrorFromCode(EMAIL_NOT_VERIFIED);
      }
    },

    async signUp(email, password) {
      const { user } = await call(() => createUserWithEmailAndPassword(auth, email, password));
      // The account exists either way. If the email can't be sent, the user asks for another
      // from the sign-in page, so a failure here is reported rather than thrown.
      const verificationSent = await sendVerification(user).then(
        () => true,
        () => false,
      );
      // Firebase has signed the new account in. Undo that: it can't be used until verified.
      await signOutQuietly();
      return { verificationSent };
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

    async resendVerificationEmail(email, password) {
      const { user } = await call(() => signInWithEmailAndPassword(auth, email, password));
      // Verified in the meantime: nothing to send, and the sign-in above is simply a normal one.
      if (user.emailVerified) return false;
      try {
        await call(() => sendVerification(user));
        return true;
      } finally {
        await signOutQuietly();
      }
    },

    async signOut() {
      await call(() => signOut(auth));
    },
  };
}
