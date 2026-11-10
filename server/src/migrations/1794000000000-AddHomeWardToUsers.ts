import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * users.home_ward_id: the ward a person lives or works in, as well as their LGA (home_admin_unit_id).
 * Optional: a profile is complete without it. It lets an alert issued for a single ward reach the people
 * in that ward, which an LGA alone can't do. The service checks that the ward is inside the person's LGA;
 * deleting the ward just clears it (ON DELETE SET NULL), like the LGA.
 */
export class AddHomeWardToUsers1794000000000 implements MigrationInterface {
  name = "AddHomeWardToUsers1794000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN home_ward_id uuid,
        ADD CONSTRAINT fk_users_home_ward FOREIGN KEY (home_ward_id) REFERENCES admin_units (id) ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE INDEX idx_users_home_ward ON users (home_ward_id) WHERE home_ward_id IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_users_home_ward`);
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT fk_users_home_ward, DROP COLUMN home_ward_id`);
  }
}
