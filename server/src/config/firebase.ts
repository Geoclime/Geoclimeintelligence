import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { env } from "./env";

/**
 * Returns the single Firebase Admin app, initialising it on first use.
 *
 * Verifying ID tokens only needs the project ID -- the Admin SDK fetches Google's public
 * signing keys itself. Sending push notifications (Cloud Messaging) needs a service account,
 * given in FIREBASE_SERVICE_ACCOUNT; without it, push is simply off.
 */
export function getFirebaseApp(): App {
  const account = env.FIREBASE_SERVICE_ACCOUNT;
  return (
    getApps()[0] ??
    initializeApp({
      projectId: env.FIREBASE_PROJECT_ID,
      ...(account ? { credential: cert({ projectId: account.projectId || env.FIREBASE_PROJECT_ID, clientEmail: account.clientEmail, privateKey: account.privateKey }) } : {}),
    })
  );
}

/** True when a service account is configured, so the server can send push notifications. */
export const canSendPush = env.FIREBASE_SERVICE_ACCOUNT !== null;
