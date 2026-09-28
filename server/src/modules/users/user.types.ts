import type { AuthUser } from "../../common/access/auth-user";
import type { UserRole } from "../../common/access/roles";
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

/** What services depend on, so they can be unit-tested with an in-memory fake (section 2). */
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  findByFirebaseUid(firebaseUid: string): Promise<User | null>;
  /** Inserts unless a row with this firebaseUid already exists; returns the stored row either way. */
  createIfAbsent(input: NewUser): Promise<User>;
  findPage(query: OffsetPageQuery): Promise<{ items: User[]; meta: PageMeta }>;
  updateAccess(id: string, patch: UserAccessPatch): Promise<User | null>;
}

export interface UserDto {
  id: string;
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
  role: UserRole;
  scopeAdminUnitId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    firebaseUid: user.firebaseUid,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    scopeAdminUnitId: user.scopeAdminUnitId,
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
