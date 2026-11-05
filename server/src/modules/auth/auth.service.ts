import type { AuthUser, VerifiedIdentity } from "../../common/access/auth-user";
import { domainEvents } from "../../common/events/domain-events";
import { DEFAULT_ROLE } from "../../common/access/roles";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "../../common/errors/app-error";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import type { IAdminUnitRepository } from "../admin-units/admin-unit.types";
import { env } from "../../config/env";
import { logger } from "../../config/logger";
import { UserRepository } from "../users/user.repository";
import { toAuthUser, toUserDto, type IUserRepository, type RoleRequestInput, type UserDto, type UserProfilePatch } from "../users/user.types";
import { FirebaseTokenVerifier, type TokenVerifier } from "./firebase-token-verifier";

const REQUIRED_MESSAGES = {
  displayName: "Enter your full name",
  phone: "Enter a phone number we can reach you on",
  homeAdminUnitId: "Choose the LGA you live or work in",
} as const;

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
    private readonly areas: Pick<IAdminUnitRepository, "findSummaryById"> = AdminUnitRepository.Instance,
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

  /** The signed-in user's own record: access plus profile details and dates. */
  async getProfile(user: AuthUser): Promise<UserDto> {
    const row = await this.users.findById(user.id);
    if (!row) throw new NotFoundError("User");
    return toUserDto(row);
  }

  /**
   * Updates the signed-in user's own profile details. The patch type has no role or scope field,
   * and the route's schema is strict, so nobody can raise their own access through this.
   */
  async updateProfile(user: AuthUser, patch: UserProfilePatch): Promise<UserDto> {
    // The details a complete profile needs can be changed, never cleared.
    const cleared = (["displayName", "phone", "homeAdminUnitId"] as const).filter((field) => field in patch && !patch[field]);
    if (cleared.length > 0) {
      throw new ValidationError(cleared.map((field) => ({ field, message: REQUIRED_MESSAGES[field] })));
    }
    if (patch.displayName !== undefined && (patch.displayName?.trim().length ?? 0) < 2) {
      throw new ValidationError([{ field: "displayName", message: REQUIRED_MESSAGES.displayName }]);
    }
    if (patch.homeAdminUnitId) {
      const area = await this.areas.findSummaryById(patch.homeAdminUnitId);
      if (!area || area.level !== 2) throw new ValidationError([{ field: "homeAdminUnitId", message: "Choose your LGA" }]);
    }
    const row = await this.users.updateProfile(user.id, patch);
    if (!row) throw new NotFoundError("User");
    return toUserDto(row);
  }

  /**
   * Opens (or replaces) the user's request for a staff role. It grants nothing: the role only
   * changes when an administrator approves it (PATCH /users/:id/access with that role).
   */
  async requestRole(user: AuthUser, body: RoleRequestInput): Promise<UserDto> {
    if (user.role === "administrator") throw new ConflictError("Administrators already have every permission");
    if (user.role === body.role) throw new ConflictError("You already have this role");

    const { organisation, jobTitle } = body;
    if (organisation !== undefined || jobTitle !== undefined) {
      await this.users.updateProfile(user.id, { ...(organisation !== undefined && { organisation }), ...(jobTitle !== undefined && { jobTitle }) });
    }
    const row = await this.users.setRoleRequest(user.id, { requestedRole: body.role, roleRequestReason: body.reason, roleRequestedAt: new Date() });
    if (!row) throw new NotFoundError("User");
    domainEvents.emit("role.requested", { userId: user.id });
    return toUserDto(row);
  }

  /** Withdraws the user's open role request. Safe to repeat: with no request it changes nothing. */
  async withdrawRoleRequest(user: AuthUser): Promise<UserDto> {
    const row = await this.users.setRoleRequest(user.id, null);
    if (!row) throw new NotFoundError("User");
    return toUserDto(row);
  }

  /**
   * The first administrator is the one account the UI can't create (Phase 2 decision 4). The
   * account whose email matches BOOTSTRAP_ADMIN_EMAIL becomes administrator, but only if:
   *   - Firebase says the email is verified, so nobody can claim it by signing up with that
   *     address before its owner does; and
   *   - no administrator exists yet, so the setting does nothing once the platform has one,
   *     and an administrator who later demotes that account is not overruled.
   * Works whether the row is brand new or was created earlier (the web client now only signs
   * an account in once its email is verified, so the row is normally created on that first
   * sign-in; rows from before that change, or from direct API callers, may already exist).
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
