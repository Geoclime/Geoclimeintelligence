import type { AuthUser } from "../../common/access/auth-user";
import { PermissionResolver } from "../../common/access/permission-resolver";
import { ADMIN_ONLY_POWERS, PERMISSION_INFO, PERMISSIONS, type Permission } from "../../common/access/permissions";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../common/errors/app-error";
import { AuditService } from "../audit/audit.service";
import { RoleRepository } from "./role.repository";
import type { IRoleRepository, RoleDto } from "./role.types";
import type { CreateRoleBody, UpdateRoleBody } from "./role.validation";

export interface PermissionCatalog {
  permissions: { key: Permission; group: string; label: string; description: string }[];
  /** What no role can be given: shown on the screen so nobody looks for it. */
  adminOnly: readonly string[];
}

/**
 * The Roles screen (Administrator-only to change; docs/audit-and-permissions.md). An administrator can
 * change what any role except Administrator may do, rename it, say whether its users can be limited to an
 * area, and create or delete their own roles. Built-in roles can't be deleted, and a role still held by
 * anyone can't be. Every change is in the activity log, and takes effect on this server at once.
 */
export class RoleService {
  private static _instance?: RoleService;
  static get Instance(): RoleService {
    return (this._instance ??= new RoleService(RoleRepository.Instance, PermissionResolver.Instance, AuditService.Instance));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly roles: IRoleRepository,
    private readonly resolver: Pick<PermissionResolver, "invalidate">,
    private readonly audit: Pick<AuditService, "record">,
  ) {}

  list(): Promise<RoleDto[]> {
    return this.roles.list();
  }

  catalog(): PermissionCatalog {
    return {
      permissions: PERMISSIONS.map((key) => ({ key, ...PERMISSION_INFO[key] })),
      adminOnly: ADMIN_ONLY_POWERS,
    };
  }

  async create(input: CreateRoleBody, actor: AuthUser): Promise<RoleDto> {
    const created = await this.roles.create({ ...input, permissions: unique(input.permissions) });
    if (!created) throw new ConflictError(`A role with the code "${input.code}" already exists`);
    this.resolver.invalidate();
    await this.audit.record(actor, {
      action: "role.created",
      entityType: "role",
      entityId: null,
      summary: `Created the role ${input.name} (${input.code}) with ${input.permissions.length} permission${input.permissions.length === 1 ? "" : "s"}`,
      details: { code: input.code, permissions: unique(input.permissions), canBeScoped: input.canBeScoped },
    });
    return this.find(input.code);
  }

  async update(code: string, input: UpdateRoleBody, actor: AuthUser): Promise<RoleDto> {
    if (code === "administrator") throw new ForbiddenError("The Administrator role always has every permission and can't be changed");
    const before = (await this.roles.list()).find((role) => role.code === code);
    if (!before) throw new NotFoundError("Role");
    const changes = {
      name: input.name ?? before.name,
      description: input.description ?? before.description,
      canBeScoped: input.canBeScoped ?? before.canBeScoped,
      permissions: input.permissions ? unique(input.permissions) : before.permissions,
    };
    if (before.canBeScoped && !changes.canBeScoped && (await this.roles.countScopedUsers(code)) > 0) {
      throw new ValidationError([
        { field: "canBeScoped", message: "Some people with this role are limited to an area. Remove their area first, then the role can stop allowing it." },
      ]);
    }
    if (!(await this.roles.update(code, changes))) throw new NotFoundError("Role");
    this.resolver.invalidate();

    const added = changes.permissions.filter((p) => !before.permissions.includes(p));
    const removed = before.permissions.filter((p) => !changes.permissions.includes(p));
    const parts = [
      added.length > 0 ? `gave ${added.map((p) => PERMISSION_INFO[p].label).join(", ")}` : null,
      removed.length > 0 ? `took away ${removed.map((p) => PERMISSION_INFO[p].label).join(", ")}` : null,
      changes.name !== before.name ? `renamed it from ${before.name}` : null,
      changes.canBeScoped !== before.canBeScoped ? (changes.canBeScoped ? "allowed area limits" : "stopped area limits") : null,
    ].filter(Boolean);
    await this.audit.record(actor, {
      action: "role.updated",
      entityType: "role",
      entityId: null,
      summary: `Changed the role ${changes.name}${parts.length > 0 ? `: ${parts.join("; ")}` : ""}`,
      details: { code, added, removed, before: { name: before.name, canBeScoped: before.canBeScoped }, after: { name: changes.name, canBeScoped: changes.canBeScoped } },
    });
    return this.find(code);
  }

  async remove(code: string, actor: AuthUser): Promise<void> {
    const role = await this.roles.findByCode(code);
    if (!role) throw new NotFoundError("Role");
    if (role.isSystem) throw new ForbiddenError("Built-in roles can't be deleted. Change what they may do instead.");
    const users = await this.roles.countUsers(code);
    if (users > 0) throw new ConflictError(`${users} ${users === 1 ? "person has" : "people have"} this role. Give them another role first.`);
    if (!(await this.roles.delete(code))) throw new ConflictError("The role could not be deleted. Someone may have just been given it.");
    this.resolver.invalidate();
    await this.audit.record(actor, { action: "role.deleted", entityType: "role", entityId: null, summary: `Deleted the role ${role.name} (${code})`, details: { code } });
  }

  private async find(code: string): Promise<RoleDto> {
    const role = (await this.roles.list()).find((item) => item.code === code);
    if (!role) throw new NotFoundError("Role");
    return role;
  }
}

const unique = (permissions: readonly Permission[]): Permission[] => [...new Set(permissions)].sort();
