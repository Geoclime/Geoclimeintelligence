import type { AuthUser, VerifiedIdentity } from "../../common/access/auth-user";
import { DEFAULT_ROLE } from "../../common/access/roles";
import { UnauthorizedError } from "../../common/errors/app-error";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { UserRepository } from "../users/user.repository";
import { toAuthUser, type IUserRepository } from "../users/user.types";
import { FirebaseTokenVerifier, type TokenVerifier } from "./firebase-token-verifier";

export class AuthService {
  private static _instance?: AuthService;
  static get Instance(): AuthService {
    return (this._instance ??= new AuthService(
      UserRepository.Instance,
      FirebaseTokenVerifier.Instance,
      env.BOOTSTRAP_ADMIN_EMAIL,
    ));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly users: IUserRepository,
    private readonly verifier: TokenVerifier,
    /** Lower-cased BOOTSTRAP_ADMIN_EMAIL; "" turns the bootstrap off. */
    private readonly bootstrapAdminEmail = "",
  ) {}

  async verifyToken(idToken: string): Promise<VerifiedIdentity> {
    try {
      return await this.verifier.verify(idToken);
    } catch (err) {
      // Firebase rejects bad tokens with "auth/..." error codes -- that's the caller's fault (401).
      // Anything else (e.g. Google's signing keys unreachable) is ours and must surface as a 500.
      if (isFirebaseAuthError(err)) throw new UnauthorizedError("Invalid or expired token");
      throw err;
    }
  }

  /**
   * Maps a Firebase identity to our own user row, creating it at the lowest-privilege role
   * the first time this Firebase account is ever seen (section 7).
   */
  async resolveUser(identity: VerifiedIdentity): Promise<AuthUser> {
    const existing = await this.users.findByFirebaseUid(identity.uid);
    const user =
      existing ??
      (await this.users.createIfAbsent({
        firebaseUid: identity.uid,
        email: identity.email,
        displayName: identity.name,
        role: DEFAULT_ROLE,
        scopeAdminUnitId: null,
      }));

    if (user.role !== "administrator" && (await this.shouldBootstrapAdmin(identity))) {
      const promoted = await this.users.updateAccess(user.id, { role: "administrator", scopeAdminUnitId: null });
      if (promoted) {
        logger.warn({ userId: promoted.id, email: promoted.email }, "Bootstrapped the first administrator from BOOTSTRAP_ADMIN_EMAIL");
        return toAuthUser(promoted);
      }
    }
    return toAuthUser(user);
  }

  /**
   * The first administrator is the one account the UI can't create (Phase 2 decision 4). The
   * account whose email matches BOOTSTRAP_ADMIN_EMAIL becomes administrator, but only if:
   *   - Firebase says the email is verified, so nobody can claim it by signing up with that
   *     address before its owner does; and
   *   - no administrator exists yet, so the setting does nothing once the platform has one,
   *     and an administrator who later demotes that account is not overruled.
   * Works whether the row is brand new or was created earlier (sign-up happens before the
   * email is verified, so the row usually already exists by the time this can apply).
   */
  private async shouldBootstrapAdmin(identity: VerifiedIdentity): Promise<boolean> {
    if (!this.bootstrapAdminEmail || !identity.emailVerified) return false;
    if (identity.email?.toLowerCase() !== this.bootstrapAdminEmail) return false;
    return !(await this.users.hasAnyAdministrator());
  }
}

function isFirebaseAuthError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.startsWith("auth/");
}
