import type { AuthUser } from "../../common/access/auth-user";
import type { RequestableRole, UserRole } from "../../common/access/roles";
import type { OffsetPageQuery } from "../../common/pagination/pagination";
import type { PageMeta } from "../../common/response/api-response";
import type { User } from "./user.entity";

export interface NewUser {
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  scopeAdminUnitId: string | null;
}

export interface UserAccessPatch {
  role: UserRole;
  scopeAdminUnitId: string | null;
}

/** The details a user may change about themselves. Never role or scope (section 7). */
export interface UserProfilePatch {
  displayName?: string | null;
  phone?: string | null;
  organisation?: string | null;
  jobTitle?: string | null;
}

/** What a user sends to ask for a role (PUT /api/v1/auth/me/role-request). */
export interface RoleRequestInput {
  role: RequestableRole;
  reason: string;
  organisation?: string | null;
  jobTitle?: string | null;
}

/** An open role request; `null` clears it (withdrawn, approved or declined). */
export interface RoleRequestPatch {
  requestedRole: RequestableRole;
  roleRequestReason: string;
  roleRequestedAt: Date;
}

/** Filters for the administrator user list. */
export interface UserListQuery extends OffsetPageQuery {
  /** Name or email contains this text (case-insensitive). */
  q?: string;
  role?: UserRole;
  /** Only users with an open role request, oldest request first. */
  pendingRequest?: boolean;
}

/** What services depend on, so they can be unit-tested with an in-memory fake (section 2). */
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByFirebaseUid(firebaseUid: string): Promise<User | null>;
  /** Inserts unless a row with this firebaseUid already exists; returns the stored row either way. */
  createIfAbsent(input: NewUser): Promise<User>;
  findPage(query: UserListQuery): Promise<{ items: User[]; meta: PageMeta }>;
  updateAccess(id: string, patch: UserAccessPatch): Promise<User | null>;
  updateProfile(id: string, patch: UserProfilePatch): Promise<User | null>;
  /** Opens (or replaces) the user's role request, or clears it with null. */
  setRoleRequest(id: string, request: RoleRequestPatch | null): Promise<User | null>;
  hasAnyAdministrator(): Promise<boolean>;
}

export interface RoleRequestDto {
  role: RequestableRole;
  reason: string;
  requestedAt: string;
}

export interface UserDto {
  id: string;
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
  phone: string | null;
  organisation: string | null;
  jobTitle: string | null;
  role: UserRole;
  scopeAdminUnitId: string | null;
  /** The user's open request for a staff role, if any. */
  roleRequest: RoleRequestDto | null;
  createdAt: string;
  updatedAt: string;
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    displayName: user.displayName,
    phone: user.phone ?? null,
    organisation: user.organisation ?? null,
    jobTitle: user.jobTitle ?? null,
    role: user.role,
    scopeAdminUnitId: user.scopeAdminUnitId,
    roleRequest:
      user.requestedRole && user.roleRequestedAt
        ? { role: user.requestedRole, reason: user.roleRequestReason ?? "", requestedAt: user.roleRequestedAt.toISOString() }
        : null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    scopeAdminUnitId: user.scopeAdminUnitId,
  };
}
