import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 2: now that admin_units exists, users.scope_admin_unit_id becomes a real foreign key.
 *
 * ON DELETE RESTRICT, never SET NULL: a null scope means "unrestricted", so deleting an area
 * must not silently widen a scoped responder's access to the whole state.
 *
 * A scope written in Phase 1 can't point at a real area yet (the table was empty), so any
 * such value would fail this constraint. The migration stops with a clear message instead of
 * guessing what to do with it.
 */
export class LinkUserScopeToAdminUnits1791200300000 implements MigrationInterface {
  name = "LinkUserScopeToAdminUnits1791200300000";

  async up(queryRunner: QueryRunner): Promise<void> {
    const dangling: { email: string | null }[] = await queryRunner.query(`
      SELECT u.email FROM users u
      WHERE u.scope_admin_unit_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM admin_units au WHERE au.id = u.scope_admin_unit_id)
    `);
    if (dangling.length > 0) {
      const who = dangling.map((row) => row.email ?? "(no email)").join(", ");
      throw new Error(
        `These users have a region scope that is not a real admin unit: ${who}. ` +
          "Clear their scope (npm run user:set-access) and run the migration again.",
      );
    }

    await queryRunner.query(`
      ALTER TABLE users
        ADD CONSTRAINT fk_users_scope_admin_unit
        FOREIGN KEY (scope_admin_unit_id) REFERENCES admin_units (id) ON DELETE RESTRICT
    `);
    await queryRunner.query(`CREATE INDEX idx_users_scope_admin_unit_id ON users (scope_admin_unit_id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_users_scope_admin_unit_id`);
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT fk_users_scope_admin_unit`);
  }
}
