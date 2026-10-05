import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 2: indexes for admin_units, in their own migration as step A3 of the Phase 2 guide asks.
 *
 * The GiST index is what makes ST_Contains / ST_Intersects fast (section 8); TypeORM's @Index
 * can't create one, so it is written here by hand. The two unique indexes stop the same area
 * being promoted twice: same parent + same name (case-insensitive), or same source code at the
 * same level of the same country.
 */
export class AddAdminUnitIndexes1791200200000 implements MigrationInterface {
  name = "AddAdminUnitIndexes1791200200000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX idx_admin_units_geom ON admin_units USING GIST (geom)`);
    await queryRunner.query(`CREATE INDEX idx_admin_units_parent_id ON admin_units (parent_id)`);
    await queryRunner.query(`CREATE INDEX idx_admin_units_level ON admin_units (country_code, level)`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_admin_units_parent_name
        ON admin_units (country_code, level, parent_id, lower(unit_name)) NULLS NOT DISTINCT
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_admin_units_code
        ON admin_units (country_code, level, unit_code) WHERE unit_code IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX uq_admin_units_code`);
    await queryRunner.query(`DROP INDEX uq_admin_units_parent_name`);
    await queryRunner.query(`DROP INDEX idx_admin_units_level`);
    await queryRunner.query(`DROP INDEX idx_admin_units_parent_id`);
    await queryRunner.query(`DROP INDEX idx_admin_units_geom`);
  }
}
