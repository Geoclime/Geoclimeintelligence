import { getAuth } from "firebase-admin/auth";
import type { VerifiedIdentity } from "../../common/access/auth-user";
import { getFirebaseApp } from "../../config/firebase";

export interface TokenVerifier {
  /** Resolves to the verified identity, or rejects if the token is invalid. */
  verify(idToken: string): Promise<VerifiedIdentity>;
}

/** The only place in the codebase that talks to the Firebase Admin SDK's auth API. */
export class FirebaseTokenVerifier implements TokenVerifier {
  private static _instance?: FirebaseTokenVerifier;
  static get Instance(): FirebaseTokenVerifier {
    return (this._instance ??= new FirebaseTokenVerifier());
  }

  async verify(idToken: string): Promise<VerifiedIdentity> {
    // Checks signature, expiry, audience (our project) and issuer. It does not check
    // revocation; that needs a service-account credential and an extra network call.
    const decoded = await getAuth(getFirebaseApp()).verifyIdToken(idToken);
    return {
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: typeof decoded["name"] === "string" ? decoded["name"] : null,
    };
  }
}
