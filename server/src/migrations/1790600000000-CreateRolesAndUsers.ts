import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 1: the five-role lookup table and the users table (section 7).
 *
 * Never edit this file once it has been applied anywhere -- add a new migration instead.
 * PostGIS is enabled by the Phase 2 migration, the first one that needs geometry.
 */
export class CreateRolesAndUsers1790600000000 implements MigrationInterface {
  name = "CreateRolesAndUsers1790600000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE roles (
        code        varchar(32) PRIMARY KEY,
        name        varchar(64) NOT NULL,
        description text        NOT NULL
      )
    `);

    // Reference taxonomy from the standard's section 7 role table -- not observational data.
    await queryRunner.query(`
      INSERT INTO roles (code, name, description) VALUES
        ('general_public',      'General Public',      'Read published disaster events, risk layers and alerts. Read-only, no admin-unit restriction.'),
        ('emergency_responder', 'Emergency Responder', 'All public reads, plus create/update disaster event reports within their assigned region.'),
        ('government_official', 'Government Official', 'All responder reads/writes within their assigned region, plus analytics and dashboards.'),
        ('researcher',          'Researcher',          'Read access to full historical data (including unpublished/under-review) and export endpoints.'),
        ('administrator',       'Administrator',       'Full read/write, user management and data-source management. No region restriction.')
    `);

    await queryRunner.query(`
      CREATE TABLE users (
        id                  uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        firebase_uid        varchar(128) NOT NULL,
        email               varchar(320),
        display_name        varchar(200),
        role                varchar(32)  NOT NULL DEFAULT 'general_public',
        scope_admin_unit_id uuid,
        created_at          timestamptz  NOT NULL DEFAULT now(),
        updated_at          timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_users_firebase_uid UNIQUE (firebase_uid),
        CONSTRAINT fk_users_role FOREIGN KEY (role) REFERENCES roles (code) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT ck_users_scope_only_for_staff CHECK (
          scope_admin_unit_id IS NULL OR role IN ('emergency_responder', 'government_official')
        )
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_users_email_lower ON users (lower(email))`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE users`);
    await queryRunner.query(`DROP TABLE roles`);
  }
}
