import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Monthly satellite flood extent, imported from the data team's Sentinel-1 tile sets
 * (`s1_flood_YYYY_MM.mbtiles`: PNG tiles, blue where water was detected, transparent elsewhere). A
 * new import `target`, 'satellite_flood_layers', with file type 'mbtiles'.
 *
 * Not to be confused with `flood_extents` (field-survey), which holds the shapes people walked or
 * drew on the ground. These are what the radar saw over the whole state in a month.
 *
 * - `satellite_flood_layers`: one row per imported month. `status` is 'staged' while the import waits
 *   for review, 'live' once promoted, 'retired' when a later import of the same month replaces it.
 *   At most one layer per country and month is live (the partial unique index).
 *   The tiles themselves (5 to 17 MB a month, about 1.2 GB for 2016 to 2026) are not stored: the
 *   import stitches one zoom level into a single mask and keeps that as a 1-bit PNG (`mask_png`,
 *   0 = no water seen, 1 = water), a few hundred KB, already on the Web Mercator grid with its four
 *   corners in WGS 84. The map draws it, and it is the record of what was imported.
 *   `data_type` is DERIVED: the radar is an observation, but "water" is a threshold applied to it.
 * - `admin_unit_satellite_flood`: how much of each LGA and ward was water that month, measured from
 *   the full-resolution mosaic when the file is checked. `measured_km2` is the part of the area the
 *   tiles cover, so a share can be given without pretending the rest was dry.
 *
 * No seed rows: a layer only arrives through an import run, and points at a real data source.
 * The area link is ON DELETE CASCADE, like rainfall and flood risk.
 */
export class CreateSatelliteFloodLayers1793400000000 implements MigrationInterface {
  name = "CreateSatelliteFloodLayers1793400000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE satellite_flood_layers (
        id               uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code     char(3)          NOT NULL,
        import_run_id    uuid,
        source_id        uuid             NOT NULL,
        status           varchar(10)      NOT NULL,
        data_type        varchar(12)      NOT NULL DEFAULT 'DERIVED',
        year_month       char(7)          NOT NULL,
        title            varchar(200)     NOT NULL,
        zoom             smallint         NOT NULL,
        mask_png         bytea            NOT NULL,
        image_width      integer          NOT NULL,
        image_height     integer          NOT NULL,
        west             double precision NOT NULL,
        south            double precision NOT NULL,
        east             double precision NOT NULL,
        north            double precision NOT NULL,
        flooded_km2      numeric(12, 3)   NOT NULL,
        covered_km2      numeric(12, 3)   NOT NULL,
        created_by       uuid             NOT NULL,
        created_at       timestamptz      NOT NULL DEFAULT now(),
        promoted_at      timestamptz,
        CONSTRAINT ck_satellite_flood_layers_status CHECK (status IN ('staged', 'live', 'retired')),
        CONSTRAINT ck_satellite_flood_layers_data_type CHECK (data_type IN ('OBSERVED', 'DERIVED', 'MODELLED', 'ESTIMATED', 'SYNTHETIC')),
        CONSTRAINT ck_satellite_flood_layers_year_month CHECK (year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
        CONSTRAINT ck_satellite_flood_layers_zoom CHECK (zoom BETWEEN 0 AND 22),
        CONSTRAINT ck_satellite_flood_layers_corners CHECK (west < east AND south < north),
        CONSTRAINT ck_satellite_flood_layers_areas CHECK (flooded_km2 >= 0 AND covered_km2 >= flooded_km2),
        CONSTRAINT uq_satellite_flood_layers_import_run UNIQUE (import_run_id),
        CONSTRAINT fk_satellite_flood_layers_country FOREIGN KEY (country_code) REFERENCES countries (country_code) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_satellite_flood_layers_source FOREIGN KEY (source_id) REFERENCES data_sources (id) ON DELETE RESTRICT,
        CONSTRAINT fk_satellite_flood_layers_import_run FOREIGN KEY (import_run_id) REFERENCES import_runs (id) ON DELETE SET NULL,
        CONSTRAINT fk_satellite_flood_layers_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_satellite_flood_layers_live ON satellite_flood_layers (country_code, year_month) WHERE status = 'live'`,
    );

    await queryRunner.query(`
      CREATE TABLE admin_unit_satellite_flood (
        id            uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
        layer_id      uuid           NOT NULL,
        admin_unit_id uuid           NOT NULL,
        flooded_km2   numeric(12, 3) NOT NULL,
        measured_km2  numeric(12, 3) NOT NULL,
        CONSTRAINT uq_admin_unit_satellite_flood_layer_unit UNIQUE (layer_id, admin_unit_id),
        CONSTRAINT ck_admin_unit_satellite_flood_areas CHECK (flooded_km2 >= 0 AND measured_km2 >= flooded_km2),
        CONSTRAINT fk_admin_unit_satellite_flood_layer FOREIGN KEY (layer_id) REFERENCES satellite_flood_layers (id) ON DELETE CASCADE,
        CONSTRAINT fk_admin_unit_satellite_flood_admin_unit FOREIGN KEY (admin_unit_id) REFERENCES admin_units (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_admin_unit_satellite_flood_unit ON admin_unit_satellite_flood (admin_unit_id)`);

    await queryRunner.query(`ALTER TABLE import_runs DROP CONSTRAINT ck_import_runs_target`);
    await queryRunner.query(`
      ALTER TABLE import_runs
        ADD CONSTRAINT ck_import_runs_target
        CHECK (target IN ('admin_units', 'rainfall_observations', 'flood_risk_layers', 'satellite_flood_layers'))
    `);
    await queryRunner.query(`ALTER TABLE import_runs DROP CONSTRAINT ck_import_runs_file_type`);
    await queryRunner.query(`
      ALTER TABLE import_runs
        ADD CONSTRAINT ck_import_runs_file_type CHECK (file_type IN ('xlsx', 'geojson', 'shapefile', 'csv', 'geotiff', 'mbtiles'))
    `);
  }

  /** Fails if a satellite flood import run exists: delete those runs first, since the old rules can't hold them. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE admin_unit_satellite_flood`);
    await queryRunner.query(`DROP TABLE satellite_flood_layers`);
    await queryRunner.query(`ALTER TABLE import_runs DROP CONSTRAINT ck_import_runs_target`);
    await queryRunner.query(`
      ALTER TABLE import_runs
        ADD CONSTRAINT ck_import_runs_target CHECK (target IN ('admin_units', 'rainfall_observations', 'flood_risk_layers'))
    `);
    await queryRunner.query(`ALTER TABLE import_runs DROP CONSTRAINT ck_import_runs_file_type`);
    await queryRunner.query(`
      ALTER TABLE import_runs
        ADD CONSTRAINT ck_import_runs_file_type CHECK (file_type IN ('xlsx', 'geojson', 'shapefile', 'csv', 'geotiff'))
    `);
  }
}
