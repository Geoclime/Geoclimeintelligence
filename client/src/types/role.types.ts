import type { Permission } from "./auth.types";

/** Mirrors RoleDto in server/src/modules/roles/role.types.ts. */
export interface Role {
  code: string;
  name: string;
  description: string;
  /** One of the five built-in roles: editable, never deleted. */
  isSystem: boolean;
  /** Its users may be limited to one area. */
  canBeScoped: boolean;
  permissions: Permission[];
  userCount: number;
}

export interface PermissionEntry {
  key: Permission;
  group: string;
  label: string;
  description: string;
}

export interface PermissionCatalog {
  permissions: PermissionEntry[];
  /** Powers no role can be given: administrators only. */
  adminOnly: string[];
}

export interface NewRoleBody {
  code: string;
  name: string;
  description: string;
  canBeScoped: boolean;
  permissions: Permission[];
}

export type RolePatch = Partial<Omit<NewRoleBody, "code">>;
