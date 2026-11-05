import type { AuthUser } from "../../common/access/auth-user";
import { domainEvents } from "../../common/events/domain-events";
import { assertScopeAllowedForRole } from "../../common/access/roles";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../../common/errors/app-error";
import type { PageMeta } from "../../common/response/api-response";
import { AuditService } from "../audit/audit.service";
import { RoleRepository } from "../roles/role.repository";
import type { IRoleRepository } from "../roles/role.types";
import { AdminUnitRepository } from "../admin-units/admin-unit.repository";
import type { IAdminUnitRepository } from "../admin-units/admin-unit.types";
import { UserRepository } from "./user.repository";
import { toUserDto, type IUserRepository, type UserDto, type UserListQuery } from "./user.types";
import type { UpdateUserAccessBody } from "./user.validation";

/**
 * Administrator-only user management. Every route that reaches this service is guarded by
 * authorise("administrator"), and Administrators are never region-scoped, so no region
 * check applies here (AI rule 9's documented Administrator-only exception).
 */
export class UserService {
  private static _instance?: UserService;
  static get Instance(): UserService {
    return (this._instance ??= new UserService(UserRepository.Instance, AdminUnitRepository.Instance, RoleRepository.Instance, AuditService.Instance));
  }

  // Public so tests can inject fakes; application code always uses .Instance.
  constructor(
    private readonly users: IUserRepository,
    private readonly regions: Pick<IAdminUnitRepository, "exists">,
    private readonly roles: Pick<IRoleRepository, "findByCode">,
    private readonly audit: Pick<AuditService, "record">,
  ) {}

  async getById(id: string): Promise<UserDto> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError("User");
    return toUserDto(user);
  }

  async list(query: UserListQuery): Promise<{ items: UserDto[]; meta: PageMeta }> {
    const { items, meta } = await this.users.findPage(query);
    return { items: items.map(toUserDto), meta };
  }

  async updateAccess(id: string, input: UpdateUserAccessBody, actor: AuthUser): Promise<UserDto> {
    if (id === actor.id) {
      // Stops an Administrator from demoting or locking out their own account by accident.
      throw new ForbiddenError("You cannot change your own role or region scope");
    }

    const target = await this.users.findById(id);
    if (!target) throw new NotFoundError("User");

    const role = input.role ?? target.role;
    const scopeAdminUnitId = input.scopeAdminUnitId !== undefined ? input.scopeAdminUnitId : target.scopeAdminUnitId;
    // Any role an administrator made can be given, as well as the built-in ones; it must exist.
    const roleRecord = await this.roles.findByCode(role);
    if (!roleRecord) throw new ValidationError([{ field: "role", message: `There is no role "${role}"` }]);
    assertScopeAllowedForRole(roleRecord, scopeAdminUnitId);
    // A scope must be a real area. The users.scope_admin_unit_id foreign key is the second gate.
    if (scopeAdminUnitId !== null && !(await this.regions.exists(scopeAdminUnitId))) {
      throw new ValidationError([{ field: "scopeAdminUnitId", message: "No area with this id exists" }]);
    }

    const previousRole = target.role;
    const updated = await this.users.updateAccess(id, { role, scopeAdminUnitId });
    if (!updated) throw new NotFoundError("User");
    if (role !== previousRole || scopeAdminUnitId !== target.scopeAdminUnitId) {
      await this.audit.record(actor, {
        action: "user.access_changed",
        entityType: "user",
        entityId: id,
        summary: `Changed ${target.displayName ?? target.email ?? "a user"}'s access${role !== previousRole ? `: ${previousRole} → ${role}` : ""}${scopeAdminUnitId !== target.scopeAdminUnitId ? (scopeAdminUnitId ? ", limited to an area" : ", no area limit") : ""}`,
        details: { before: { role: previousRole, scopeAdminUnitId: target.scopeAdminUnitId }, after: { role, scopeAdminUnitId } },
      });
    }
    // A new role (asked for or not) is news to the person: they hear about it.
    if (role !== previousRole) domainEvents.emit("role.answered", { userId: id, role, approved: true });
    // Giving the user the role they asked for is approving their request, so it closes. Any other
    // change (a scope, a different role) leaves an open request for the administrator to answer.
    if (updated.requestedRole && updated.requestedRole === role) {
      const resolved = await this.users.setRoleRequest(id, null);
      if (resolved) return toUserDto(resolved);
    }
    return toUserDto(updated);
  }

  /** Declines a user's open role request: it closes and their role stays as it is. */
  async declineRoleRequest(id: string): Promise<UserDto> {
    const target = await this.users.findById(id);
    if (!target) throw new NotFoundError("User");
    if (!target.requestedRole) throw new ConflictError("This user has no open role request");
    const updated = await this.users.setRoleRequest(id, null);
    if (!updated) throw new NotFoundError("User");
    domainEvents.emit("role.answered", { userId: id, role: target.requestedRole, approved: false });
    return toUserDto(updated);
  }
}
