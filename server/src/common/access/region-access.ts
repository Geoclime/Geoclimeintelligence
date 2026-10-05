import { AdminUnitRepository } from "../../modules/admin-units/admin-unit.repository";
import { ForbiddenError } from "../errors/app-error";
import type { AuthUser } from "./auth-user";

/** Answers "is admin unit X inside admin unit Y?" by walking `admin_units.parent_id`. */
export interface RegionHierarchy {
  isDescendantOrSelf(targetAdminUnitId: string, ancestorAdminUnitId: string): Promise<boolean>;
  /**
   * The root admin unit plus every descendant of it. Empty when the root doesn't exist, so a
   * stale scope matches nothing rather than everything. Repositories must treat an empty list
   * as "no rows", never as "no filter".
   */
  subtreeIds(rootAdminUnitId: string): Promise<string[]>;
}

export type RegionScoped<Q> = Q & {
  /** undefined = unrestricted; otherwise repositories filter `admin_unit_id IN (...)`. */
  scopeAdminUnitIds?: string[];
};

/**
 * The region half of access control (section 7). The role half is `authorise()`, which runs
 * first on the route; this runs in the service because it needs a hierarchy lookup.
 */
export class RegionAccess {
  private static _instance?: RegionAccess;
  static get Instance(): RegionAccess {
    // Phase 2: the real hierarchy, via recursive CTEs over admin_units.parent_id.
    return (this._instance ??= new RegionAccess(AdminUnitRepository.Instance));
  }

  constructor(private readonly hierarchy: RegionHierarchy) {}

  /** For single-record reads/writes: throws 403 if the target is outside the user's scope. */
  async assert(user: AuthUser, targetAdminUnitId: string): Promise<void> {
    if (!user.scopeAdminUnitId) return;
    const allowed = await this.hierarchy.isDescendantOrSelf(targetAdminUnitId, user.scopeAdminUnitId);
    if (!allowed) throw new ForbiddenError();
  }

  /** For lists/searches: never throws, narrows results to the user's scope instead. */
  async scope<Q extends object>(query: Q, user: AuthUser): Promise<RegionScoped<Q>> {
    if (!user.scopeAdminUnitId) return { ...query };
    return { ...query, scopeAdminUnitIds: await this.hierarchy.subtreeIds(user.scopeAdminUnitId) };
  }
}

export function assertRegionAccess(user: AuthUser, targetAdminUnitId: string): Promise<void> {
  return RegionAccess.Instance.assert(user, targetAdminUnitId);
}

export function applyRegionScope<Q extends object>(query: Q, user: AuthUser): Promise<RegionScoped<Q>> {
  return RegionAccess.Instance.scope(query, user);
}
