import { getApps, initializeApp, type App } from "firebase-admin/app";
import { env } from "./env";

/**
 * Returns the single Firebase Admin app, initialising it on first use.
 *
 * Verifying ID tokens only needs the project ID -- the Admin SDK fetches Google's public
 * signing keys itself. If GOOGLE_APPLICATION_CREDENTIALS is set, the SDK also picks up that
 * service account automatically for later features that need it.
 */
export function getFirebaseApp(): App {
  return getApps()[0] ?? initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
}
