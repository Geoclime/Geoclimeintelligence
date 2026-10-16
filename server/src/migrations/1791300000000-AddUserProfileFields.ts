import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Self-service profile details: a phone number, an organisation and a job title, alongside the
 * existing display_name. All optional. Each user edits their own through PATCH /api/v1/auth/me;
 * administrators see them in the user list, which helps them decide who should get staff access.
 *
 * None of these grant anything: access still comes only from role and scope_admin_unit_id.
 */
export class AddUserProfileFields1791300000000 implements MigrationInterface {
  name = "AddUserProfileFields1791300000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN phone        varchar(32),
        ADD COLUMN organisation varchar(200),
        ADD COLUMN job_title    varchar(120)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        DROP COLUMN job_title,
        DROP COLUMN organisation,
        DROP COLUMN phone
    `);
  }
}
