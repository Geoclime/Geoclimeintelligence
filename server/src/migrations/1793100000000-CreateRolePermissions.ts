import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Roles an administrator can edit, and new roles they can create (docs/audit-and-permissions.md).
 *
 *  - `roles` gains `is_system` (the five built-in roles: never deleted or renamed in code), and
 *    `can_be_scoped` (whether its users may be limited to one area). Before this, only responders and
 *    officials could be, written into a CHECK; that CHECK is replaced by a trigger that reads the flag,
 *    so a new role can be scoped too.
 *  - `role_permissions` says which permission each role holds (the list is in
 *    common/access/permissions.ts). It is seeded to exactly what each built-in role could do before,
 *    so this migration changes nobody's access. Administrators hold every permission without rows.
 *  - New role codes are lower-case words joined by underscores, like the built-in ones.
 */
const SEED: Record<string, string[]> = {
  emergency_responder: [
    "survey.record_flood", "survey.recede_flood", "survey.record_drain", "survey.inspect_drain",
    "survey.delete_own", "survey.view_people", "photos.add", "photos.view", "reports.review",
  ],
  government_official: [
    "survey.record_flood", "survey.recede_flood", "survey.record_drain", "survey.inspect_drain",
    "survey.delete_own", "survey.view_people", "photos.add", "photos.view", "reports.review", "alerts.issue",
  ],
};

export class CreateRolePermissions1793100000000 implements MigrationInterface {
  name = "CreateRolePermissions1793100000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE roles
        ADD COLUMN is_system     boolean     NOT NULL DEFAULT false,
        ADD COLUMN can_be_scoped boolean     NOT NULL DEFAULT false,
        ADD COLUMN created_at    timestamptz NOT NULL DEFAULT now(),
        ADD COLUMN updated_at    timestamptz NOT NULL DEFAULT now(),
        ADD CONSTRAINT ck_roles_code CHECK (code ~ '^[a-z][a-z0-9_]{1,31}$')
    `);
    await queryRunner.query(`
      UPDATE roles SET is_system = true,
                       can_be_scoped = code IN ('emergency_responder', 'government_official')
       WHERE code IN ('general_public', 'emergency_responder', 'government_official', 'researcher', 'administrator')
    `);

    await queryRunner.query(`
      CREATE TABLE role_permissions (
        role_code  varchar(32) NOT NULL,
        permission varchar(48) NOT NULL,
        granted_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (role_code, permission),
        CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_code) REFERENCES roles (code) ON UPDATE CASCADE ON DELETE CASCADE,
        CONSTRAINT ck_role_permissions_not_admin CHECK (role_code <> 'administrator')
      )
    `);
    for (const [role, permissions] of Object.entries(SEED)) {
      await queryRunner.query(
        `INSERT INTO role_permissions (role_code, permission) SELECT $1, unnest($2::varchar[])`,
        [role, permissions],
      );
    }

    // Who may carry a region scope now comes from the role itself.
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT ck_users_scope_only_for_staff`);
    await queryRunner.query(`
      CREATE FUNCTION users_scope_allowed() RETURNS trigger AS $$
      BEGIN
        IF NEW.scope_admin_unit_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM roles r WHERE r.code = NEW.role AND r.can_be_scoped) THEN
          RAISE EXCEPTION 'role % cannot carry a region scope', NEW.role USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_users_scope_allowed
        BEFORE INSERT OR UPDATE OF role, scope_admin_unit_id ON users
        FOR EACH ROW EXECUTE FUNCTION users_scope_allowed()
    `);
  }

  /** Fails while custom roles have users: move those users to a built-in role first. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER trg_users_scope_allowed ON users`);
    await queryRunner.query(`DROP FUNCTION users_scope_allowed()`);
    await queryRunner.query(`
      ALTER TABLE users ADD CONSTRAINT ck_users_scope_only_for_staff CHECK (
        scope_admin_unit_id IS NULL OR role IN ('emergency_responder', 'government_official')
      )
    `);
    await queryRunner.query(`DROP TABLE role_permissions`);
    await queryRunner.query(`DELETE FROM roles WHERE NOT is_system`);
    await queryRunner.query(`
      ALTER TABLE roles
        DROP CONSTRAINT ck_roles_code,
        DROP COLUMN updated_at,
        DROP COLUMN created_at,
        DROP COLUMN can_be_scoped,
        DROP COLUMN is_system
    `);
  }
}
