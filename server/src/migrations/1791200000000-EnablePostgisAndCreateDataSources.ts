import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 2: switches PostGIS on and creates a minimal `data_sources` table.
 *
 * Every admin_units row must point at a real source (section 4, section 13), but the full
 * data-sources feature is Phase 3. Decision 1 in "Phase 2 - Geography, Step by Step": build
 * the minimal table now, filled through the admin import screen (never seeded), and let
 * Phase 3 add the rest of the Backlog2 columns (coverage_scope, reliability, ...).
 */
export class EnablePostgisAndCreateDataSources1791200000000 implements MigrationInterface {
  name = "EnablePostgisAndCreateDataSources1791200000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS postgis`);

    await queryRunner.query(`
      CREATE TABLE data_sources (
        id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        provider      varchar(200) NOT NULL,
        dataset_name  varchar(300) NOT NULL,
        url           text         NOT NULL,
        license       varchar(200) NOT NULL,
        downloaded_on date         NOT NULL,
        notes         text,
        created_by    uuid,
        created_at    timestamptz  NOT NULL DEFAULT now(),
        updated_at    timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT ck_data_sources_url_http CHECK (url ~* '^https?://'),
        CONSTRAINT fk_data_sources_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE data_sources`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS postgis`);
  }
}
