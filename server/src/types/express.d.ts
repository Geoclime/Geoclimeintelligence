import type { AuthUser, VerifiedIdentity } from "../common/access/auth-user";

declare global {
  namespace Express {
    interface Request {
      /** Set by authMiddleware once the Firebase ID token is verified. */
      firebaseUser?: VerifiedIdentity;
      /** Set by resolveUserMiddleware: our own user row, with role and region scope. */
      user?: AuthUser;
    }
  }
}

export {};
