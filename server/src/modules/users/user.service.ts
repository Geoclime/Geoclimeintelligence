import type { AuthUser } from "../../common/access/auth-user";
import { assertScopeAllowedForRole } from "../../common/access/roles";
import { ForbiddenError, NotFoundError } from "../../common/errors/app-error";
import type { OffsetPageQuery } from "../../common/pagination/pagination";
import type { PageMeta } from "../../common/response/api-response";
import { UserRepository } from "./user.repository";
import { toUserDto, type IUserRepository, type UserDto } from "./user.types";
import type { UpdateUserAccessBody } from "./user.validation";

/**
 * Administrator-only user management. Every route that reaches this service is guarded by
 * authorise("administrator"), and Administrators are never region-scoped, so no region
 * check applies here (AI rule 9's documented Administrator-only exception).
 */
export class UserService {
  private static _instance?: UserService;
  static get Instance(): UserService {
    return (this._instance ??= new UserService(UserRepository.Instance));
  }

  // Public so tests can inject a fake repository; application code always uses .Instance.
  constructor(private readonly users: IUserRepository) {}

  async getById(id: string): Promise<UserDto> {
    const user = await this.users.findById(id);
    if (!user) throw new NotFoundError("User");
    return toUserDto(user);
  }

  async list(query: OffsetPageQuery): Promise<{ items: UserDto[]; meta: PageMeta }> {
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
    assertScopeAllowedForRole(role, scopeAdminUnitId);
    // TODO(Phase 2): reject a scopeAdminUnitId that isn't a real admin_units row (404), and add
    // the users.scope_admin_unit_id -> admin_units.id FK in the Phase 2 migration.

    const updated = await this.users.updateAccess(id, { role, scopeAdminUnitId });
    if (!updated) throw new NotFoundError("User");
    return toUserDto(updated);
  }
}
