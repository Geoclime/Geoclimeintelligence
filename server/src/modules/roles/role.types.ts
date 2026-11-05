import type { Permission } from "../../common/access/permissions";

/** A role as the Roles screen and the Users screen see it. */
export interface RoleDto {
  code: string;
  name: string;
  description: string;
  /** One of the five built-in roles: it can be edited but never deleted, and its code never changes. */
  isSystem: boolean;
  /** Its users may be limited to one area (region scope). */
  canBeScoped: boolean;
  /** Administrators hold everything; for them this lists every permission and can't be changed. */
  permissions: Permission[];
  /** How many accounts hold it now. */
  userCount: number;
}

export interface NewRole {
  code: string;
  name: string;
  description: string;
  canBeScoped: boolean;
  permissions: Permission[];
}

export interface RoleChanges {
  name: string;
  description: string;
  canBeScoped: boolean;
  permissions: Permission[];
}

export interface RoleRecord {
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  canBeScoped: boolean;
}

export interface IRoleRepository {
  list(): Promise<RoleDto[]>;
  findByCode(code: string): Promise<RoleRecord | null>;
  /** Every non-administrator role's permissions, for PermissionResolver's cache. */
  loadPermissions(): Promise<Map<string, Permission[]>>;
  /** False when a role with that code already exists. */
  create(input: NewRole): Promise<boolean>;
  /** Replaces the role's details and its whole permission set, in one transaction. Null when there is no such role. */
  update(code: string, changes: RoleChanges): Promise<RoleRecord | null>;
  /** False when the role doesn't exist or still has users. */
  delete(code: string): Promise<boolean>;
  countUsers(code: string): Promise<number>;
  /** How many users of the role carry a region scope (a role can't stop being scopable while some do). */
  countScopedUsers(code: string): Promise<number>;
}
