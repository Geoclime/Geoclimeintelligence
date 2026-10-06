import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 2: the generic geography tables from the Backlog2 ERD (decision 2 in the Phase 2
 * guide: Backlog2's column names -- unit_name, geom, unit_code -- over the standard's
 * name/boundary example).
 *
 * No seed rows. An administrator creates each country on the admin Countries page, and every
 * admin unit arrives through the import pipeline (staging -> checks -> promotion).
 * Indexes live in the next migration.
 */
export class CreateCountriesAndAdminUnits1791200100000 implements MigrationInterface {
  name = "CreateCountriesAndAdminUnits1791200100000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE countries (
        country_code char(3)                      PRIMARY KEY,
        country_name varchar(100)                 NOT NULL,
        -- The country's own names for its levels, in order: index 0 is level 1.
        level_names  text[]                       NOT NULL,
        -- Optional rough box [minLon, minLat, maxLon, maxLat]: imported shapes must sit inside it.
        bbox         double precision[],
        geom         geometry(MultiPolygon, 4326),
        source_id    uuid,
        created_at   timestamptz                  NOT NULL DEFAULT now(),
        updated_at   timestamptz                  NOT NULL DEFAULT now(),
        CONSTRAINT ck_countries_code_iso3 CHECK (country_code ~ '^[A-Z]{3}$'),
        CONSTRAINT ck_countries_level_names CHECK (cardinality(level_names) BETWEEN 1 AND 6),
        CONSTRAINT ck_countries_bbox CHECK (
          bbox IS NULL OR (
            cardinality(bbox) = 4
            AND bbox[1] >= -180 AND bbox[3] <= 180 AND bbox[1] < bbox[3]
            AND bbox[2] >= -90  AND bbox[4] <= 90  AND bbox[2] < bbox[4]
          )
        ),
        CONSTRAINT fk_countries_source FOREIGN KEY (source_id) REFERENCES data_sources (id) ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE admin_units (
        id            uuid                         PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code  char(3)                      NOT NULL,
        parent_id     uuid,
        level         smallint                     NOT NULL,
        level_name    varchar(40)                  NOT NULL,
        unit_name     varchar(200)                 NOT NULL,
        unit_code     varchar(100),
        geom          geometry(MultiPolygon, 4326) NOT NULL,
        source_id     uuid                         NOT NULL,
        import_run_id uuid,
        created_at    timestamptz                  NOT NULL DEFAULT now(),
        updated_at    timestamptz                  NOT NULL DEFAULT now(),
        CONSTRAINT ck_admin_units_level CHECK (level BETWEEN 1 AND 6),
        -- Level 1 hangs off the country directly; every deeper level needs a parent.
        CONSTRAINT ck_admin_units_parent_by_level CHECK ((level = 1) = (parent_id IS NULL)),
        CONSTRAINT ck_admin_units_name CHECK (length(trim(unit_name)) > 0),
        -- Second gate behind the import checks: nothing invalid ever reaches the live table.
        CONSTRAINT ck_admin_units_geom_valid CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom)),
        CONSTRAINT fk_admin_units_country FOREIGN KEY (country_code) REFERENCES countries (country_code) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_admin_units_parent FOREIGN KEY (parent_id) REFERENCES admin_units (id) ON DELETE RESTRICT,
        CONSTRAINT fk_admin_units_source FOREIGN KEY (source_id) REFERENCES data_sources (id) ON DELETE RESTRICT
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE admin_units`);
    await queryRunner.query(`DROP TABLE countries`);
  }
}
