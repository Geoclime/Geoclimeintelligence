import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 2: the generic import pipeline (file -> staging -> checks -> live).
 *
 * A file never writes straight into a live table. Each upload is an `import_runs` row; each
 * row of the file is an `import_staging_rows` row holding the raw values exactly as read, the
 * original shape text, the cleaned shape, and every error and warning the checks found. Only
 * an administrator's Promote copies the rows that passed into the live table.
 *
 * `target` says which live table a run feeds. Phase 2 has one (admin_units); Phase 5 adds the
 * rainfall feed through the same tables, so target-specific settings live in `options` and
 * the cleaned per-row values in `fields`, both jsonb.
 */
export class CreateImportTables1791200400000 implements MigrationInterface {
  name = "CreateImportTables1791200400000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE import_runs (
        id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        target         varchar(40)  NOT NULL,
        file_name      varchar(255) NOT NULL,
        file_type      varchar(10)  NOT NULL,
        sheet_name     varchar(100),
        options        jsonb        NOT NULL,
        column_mapping jsonb        NOT NULL,
        source_id      uuid         NOT NULL,
        status         varchar(20)  NOT NULL,
        row_count      integer      NOT NULL DEFAULT 0,
        passed_count   integer      NOT NULL DEFAULT 0,
        error_count    integer      NOT NULL DEFAULT 0,
        promoted_count integer,
        warnings       text[]       NOT NULL DEFAULT '{}',
        created_by     uuid         NOT NULL,
        created_at     timestamptz  NOT NULL DEFAULT now(),
        promoted_by    uuid,
        promoted_at    timestamptz,
        CONSTRAINT ck_import_runs_target CHECK (target IN ('admin_units')),
        CONSTRAINT ck_import_runs_file_type CHECK (file_type IN ('xlsx', 'geojson')),
        CONSTRAINT ck_import_runs_status CHECK (status IN ('checked', 'promoted')),
        CONSTRAINT fk_import_runs_source FOREIGN KEY (source_id) REFERENCES data_sources (id) ON DELETE RESTRICT,
        CONSTRAINT fk_import_runs_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
        CONSTRAINT fk_import_runs_promoted_by FOREIGN KEY (promoted_by) REFERENCES users (id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_import_runs_created_at ON import_runs (created_at DESC, id DESC)`);

    await queryRunner.query(`
      CREATE TABLE import_staging_rows (
        id          uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id      uuid                     NOT NULL,
        row_number  integer                  NOT NULL,
        raw         jsonb                    NOT NULL,
        geom_source text,
        geom_format varchar(10),
        geom        geometry(Geometry, 4326),
        fields      jsonb                    NOT NULL DEFAULT '{}',
        errors      text[]                   NOT NULL DEFAULT '{}',
        warnings    text[]                   NOT NULL DEFAULT '{}',
        status      varchar(10)              NOT NULL DEFAULT 'pending',
        CONSTRAINT uq_import_staging_rows_run_row UNIQUE (run_id, row_number),
        CONSTRAINT ck_import_staging_rows_format CHECK (geom_format IS NULL OR geom_format IN ('wkt', 'geojson')),
        CONSTRAINT ck_import_staging_rows_status CHECK (status IN ('pending', 'passed', 'failed')),
        CONSTRAINT fk_import_staging_rows_run FOREIGN KEY (run_id) REFERENCES import_runs (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_import_staging_rows_geom ON import_staging_rows USING GIST (geom)`);

    // Turns shape text into a geometry, or NULL if PostGIS can't read it. A bad shape in one
    // row must fail that row only, not abort the statement for the whole file.
    await queryRunner.query(`
      CREATE FUNCTION import_parse_geometry(source text, format text) RETURNS geometry
      LANGUAGE plpgsql STABLE AS $$
      BEGIN
        IF format = 'geojson' THEN
          RETURN ST_GeomFromGeoJSON(source);
        ELSIF source ~* '^\\s*SRID=' THEN
          RETURN ST_GeomFromEWKT(source);
        ELSE
          RETURN ST_GeomFromText(source, 4326);
        END IF;
      EXCEPTION WHEN others THEN
        RETURN NULL;
      END;
      $$
    `);

    await queryRunner.query(`
      ALTER TABLE admin_units
        ADD CONSTRAINT fk_admin_units_import_run FOREIGN KEY (import_run_id) REFERENCES import_runs (id) ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE admin_units DROP CONSTRAINT fk_admin_units_import_run`);
    await queryRunner.query(`DROP FUNCTION import_parse_geometry(text, text)`);
    await queryRunner.query(`DROP TABLE import_staging_rows`);
    await queryRunner.query(`DROP TABLE import_runs`);
  }
}
