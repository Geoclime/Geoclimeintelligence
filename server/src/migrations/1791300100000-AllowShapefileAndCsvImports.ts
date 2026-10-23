import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The import pipeline now reads shapefiles and CSV files as well as Excel and GeoJSON, so a
 * run's `file_type` may be 'shapefile' or 'csv'. Only the CHECK constraint changes: the column
 * (varchar(10)) already fits both names.
 */
export class AllowShapefileAndCsvImports1791300100000 implements MigrationInterface {
  name = "AllowShapefileAndCsvImports1791300100000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE import_runs DROP CONSTRAINT ck_import_runs_file_type`);
    await queryRunner.query(`
      ALTER TABLE import_runs
        ADD CONSTRAINT ck_import_runs_file_type CHECK (file_type IN ('xlsx', 'geojson', 'shapefile', 'csv'))
    `);
  }

  /** Fails if a shapefile or CSV run exists: delete those runs first, since the old rule can't hold them. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE import_runs DROP CONSTRAINT ck_import_runs_file_type`);
    await queryRunner.query(`
      ALTER TABLE import_runs
        ADD CONSTRAINT ck_import_runs_file_type CHECK (file_type IN ('xlsx', 'geojson'))
    `);
  }
}
