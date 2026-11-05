import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 5: the ERD's RAINFALL_OBSERVATIONS table, fed by the import pipeline (a new `target`,
 * 'rainfall_observations'). One row per area per month, e.g. CHIRPS monthly means per LGA from
 * Google Earth Engine. No seed rows: every row arrives through an import run and points at a
 * real data source.
 *
 * - `year_month` is text "YYYY-MM", as in the ERD, so it sorts and matches without time zones.
 * - `mean_rainfall_mm` is nullable: the latest month of an export is usually incomplete, and is
 *   stored without a value until a later file fills it in.
 * - One value per area per month (the unique key): a later file revises a month in place, with
 *   the import screen listing every value it changes before anything is promoted.
 * - The area link is ON DELETE CASCADE: rainfall belongs to its area, so clearing a level (to
 *   re-import its boundaries) clears that level's rainfall too; the staged rows of the import
 *   runs that loaded it are kept, and the file can be uploaded again.
 */
export class CreateRainfallObservations1791600000000 implements MigrationInterface {
  name = "CreateRainfallObservations1791600000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE rainfall_observations (
        id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code     char(3)       NOT NULL,
        admin_unit_id    uuid          NOT NULL,
        year_month       char(7)       NOT NULL,
        mean_rainfall_mm numeric(8, 3),
        data_type        varchar(12)   NOT NULL,
        source_id        uuid          NOT NULL,
        import_run_id    uuid,
        created_at       timestamptz   NOT NULL DEFAULT now(),
        updated_at       timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT uq_rainfall_observations_unit_month UNIQUE (admin_unit_id, year_month),
        CONSTRAINT ck_rainfall_observations_year_month CHECK (year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
        CONSTRAINT ck_rainfall_observations_mm CHECK (mean_rainfall_mm IS NULL OR mean_rainfall_mm >= 0),
        CONSTRAINT ck_rainfall_observations_data_type CHECK (data_type IN ('OBSERVED', 'DERIVED', 'MODELLED', 'ESTIMATED', 'SYNTHETIC')),
        CONSTRAINT fk_rainfall_observations_country FOREIGN KEY (country_code) REFERENCES countries (country_code) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_rainfall_observations_admin_unit FOREIGN KEY (admin_unit_id) REFERENCES admin_units (id) ON DELETE CASCADE,
        CONSTRAINT fk_rainfall_observations_source FOREIGN KEY (source_id) REFERENCES data_sources (id) ON DELETE RESTRICT,
        CONSTRAINT fk_rainfall_observations_import_run FOREIGN KEY (import_run_id) REFERENCES import_runs (id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_rainfall_observations_country_month ON rainfall_observations (country_code, year_month)`);

    await queryRunner.query(`ALTER TABLE import_runs DROP CONSTRAINT ck_import_runs_target`);
    await queryRunner.query(`
      ALTER TABLE import_runs
        ADD CONSTRAINT ck_import_runs_target CHECK (target IN ('admin_units', 'rainfall_observations'))
    `);
  }

  /** Fails if a rainfall import run exists: delete those runs first, since the old rule can't hold them. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE rainfall_observations`);
    await queryRunner.query(`ALTER TABLE import_runs DROP CONSTRAINT ck_import_runs_target`);
    await queryRunner.query(`ALTER TABLE import_runs ADD CONSTRAINT ck_import_runs_target CHECK (target IN ('admin_units'))`);
  }
}
