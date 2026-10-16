import type { UserRole } from "./auth.types";

/**
 * An account as the Administrator user endpoints return it. Mirrors UserDto in
 * server/src/modules/users/user.types.ts field for field.
 */
export interface ManagedUser {
  id: string;
  firebaseUid: string;
  email: string | null;
  displayName: string | null;
  phone?: string | null;
  organisation?: string | null;
  jobTitle?: string | null;
  role: UserRole;
  scopeAdminUnitId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Query for GET /api/v1/users (offset paging; the server caps pageSize at 100). */
export interface UserListParams {
  page: number;
  pageSize: number;
  /** Name, email or organisation contains this text. */
  q?: string;
  role?: UserRole;
}

/**
 * Body for PATCH /api/v1/users/:id/access. At least one field must be present; send
 * `scopeAdminUnitId: null` to clear a scope.
 */
export interface UserAccessPatch {
  role?: UserRole;
  scopeAdminUnitId?: string | null;
}
