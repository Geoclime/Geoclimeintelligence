import type { AuthUser, VerifiedIdentity } from "../../common/access/auth-user";
import { DEFAULT_ROLE } from "../../common/access/roles";
import { UnauthorizedError } from "../../common/errors/app-error";
import { UserRepository } from "../users/user.repository";
import { toAuthUser, type IUserRepository } from "../users/user.types";
import { FirebaseTokenVerifier, type TokenVerifier } from "./firebase-token-verifier";

export class AuthService {
  private static _instance?: AuthService;
  static get Instance(): AuthService {
    return (this._instance ??= new AuthService(UserRepository.Instance, FirebaseTokenVerifier.Instance));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly users: IUserRepository,
    private readonly verifier: TokenVerifier,
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
    return toAuthUser(user);
  }
}

function isFirebaseAuthError(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" && code.startsWith("auth/");
}
