import { AppDataSource } from "../../config/data-source";
import { isPermission, PERMISSIONS, type Permission } from "../../common/access/permissions";
import type { IRoleRepository, NewRole, RoleChanges, RoleDto, RoleRecord } from "./role.types";

type RoleRow = Omit<RoleDto, "permissions"> & { permissions: string[] | null };

const toPermissions = (values: readonly string[] | null): Permission[] => (values ?? []).filter(isPermission);

/**
 * Roles and what they may do. Not a BaseRepository: it owns two tables (roles, role_permissions) and edits
 * them together in one transaction, like the map-layer loader.
 */
export class RoleRepository implements IRoleRepository {
  private static _instance?: RoleRepository;
  static get Instance(): RoleRepository {
    return (this._instance ??= new RoleRepository());
  }

  async list(): Promise<RoleDto[]> {
    // Built-in roles first, in their usual order, then the ones administrators made, by name.
    const rows: RoleRow[] = await AppDataSource.query(
      `SELECT r.code, r.name, r.description, r.is_system AS "isSystem", r.can_be_scoped AS "canBeScoped",
              (SELECT array_agg(p.permission ORDER BY p.permission) FROM role_permissions p WHERE p.role_code = r.code) AS permissions,
              (SELECT count(*)::int FROM users u WHERE u.role = r.code) AS "userCount"
         FROM roles r
        ORDER BY r.is_system DESC,
                 array_position(ARRAY['general_public','researcher','emergency_responder','government_official','administrator']::varchar[], r.code),
                 r.name`,
    );
    return rows.map((row) => ({
      ...row,
      permissions: row.code === "administrator" ? [...PERMISSIONS] : toPermissions(row.permissions),
    }));
  }

  async findByCode(code: string): Promise<RoleRecord | null> {
    const rows: RoleRecord[] = await AppDataSource.query(
      `SELECT code, name, description, is_system AS "isSystem", can_be_scoped AS "canBeScoped" FROM roles WHERE code = $1`,
      [code],
    );
    return rows[0] ?? null;
  }

  async loadPermissions(): Promise<Map<string, Permission[]>> {
    const rows: { roleCode: string; permissions: string[] }[] = await AppDataSource.query(
      `SELECT r.code AS "roleCode", COALESCE(array_agg(p.permission) FILTER (WHERE p.permission IS NOT NULL), '{}') AS permissions
         FROM roles r LEFT JOIN role_permissions p ON p.role_code = r.code
        WHERE r.code <> 'administrator'
        GROUP BY r.code`,
    );
    return new Map(rows.map((row) => [row.roleCode, toPermissions(row.permissions)]));
  }

  async create(input: NewRole): Promise<boolean> {
    return AppDataSource.transaction(async (manager) => {
      const inserted: unknown[] = await manager.query(
        `INSERT INTO roles (code, name, description, is_system, can_be_scoped) VALUES ($1, $2, $3, false, $4)
         ON CONFLICT (code) DO NOTHING RETURNING code`,
        [input.code, input.name, input.description, input.canBeScoped],
      );
      if (inserted.length === 0) return false;
      if (input.permissions.length > 0) {
        await manager.query(`INSERT INTO role_permissions (role_code, permission) SELECT $1, unnest($2::varchar[])`, [input.code, input.permissions]);
      }
      return true;
    });
  }

  async update(code: string, changes: RoleChanges): Promise<RoleRecord | null> {
    return AppDataSource.transaction(async (manager) => {
      const rows: RoleRecord[] = await manager.query(
        `WITH changed AS (
           UPDATE roles SET name = $2, description = $3, can_be_scoped = $4, updated_at = now()
            WHERE code = $1 AND code <> 'administrator'
            RETURNING *)
         SELECT code, name, description, is_system AS "isSystem", can_be_scoped AS "canBeScoped" FROM changed`,
        [code, changes.name, changes.description, changes.canBeScoped],
      );
      if (!rows[0]) return null;
      // The whole set is replaced, so the screen's ticks are exactly what the role holds afterwards.
      await manager.query(`DELETE FROM role_permissions WHERE role_code = $1 AND NOT (permission = ANY($2::varchar[]))`, [code, changes.permissions]);
      if (changes.permissions.length > 0) {
        await manager.query(
          `INSERT INTO role_permissions (role_code, permission) SELECT $1, unnest($2::varchar[]) ON CONFLICT DO NOTHING`,
          [code, changes.permissions],
        );
      }
      return rows[0];
    });
  }

  async delete(code: string): Promise<boolean> {
    const [row]: { n: number }[] = await AppDataSource.query(
      `WITH gone AS (
         DELETE FROM roles r WHERE r.code = $1 AND NOT r.is_system AND NOT EXISTS (SELECT 1 FROM users u WHERE u.role = r.code)
         RETURNING 1)
       SELECT count(*)::int AS n FROM gone`,
      [code],
    );
    return (row?.n ?? 0) > 0;
  }

  async countUsers(code: string): Promise<number> {
    const [row]: { n: number }[] = await AppDataSource.query(`SELECT count(*)::int AS n FROM users WHERE role = $1`, [code]);
    return row?.n ?? 0;
  }

  async countScopedUsers(code: string): Promise<number> {
    const [row]: { n: number }[] = await AppDataSource.query(`SELECT count(*)::int AS n FROM users WHERE role = $1 AND scope_admin_unit_id IS NOT NULL`, [code]);
    return row?.n ?? 0;
  }
}
