import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The flood risk map, imported from a classified GeoTIFF (a new import `target`, 'flood_risk_layers',
 * with file type 'geotiff'). It is the ERD's FLOOD_SUSCEPTIBILITY_ZONES idea kept as a grid rather
 * than polygons: a modelled judgement of where it could flood, so `data_type` is DERIVED.
 *
 * - `flood_risk_layers`: one row per imported map. `status` is 'staged' while the import waits for
 *   review, 'live' once promoted, 'retired' when a later import replaces it. At most one layer per
 *   country is live (the partial unique index), so promoting a new one retires the old one in the
 *   same transaction.
 *   It holds three things: the picture the map draws (`image_png`, already laid out on the Web
 *   Mercator grid, with its four corners in WGS 84), the class grid (`grid_gz`, one byte per source
 *   cell, 0 = no data, 1..5 = very low..very high, gzipped) so a point can be asked its class, and
 *   the cell counts per class for the legend. The blobs are a few hundred KB each.
 * - `admin_unit_flood_risk`: how many cells of each class fall inside each LGA and ward, worked out
 *   when the file is checked. Areas and percentages are derived on read from the cell counts and the
 *   layer's cell size, so there is one number to keep right.
 *
 * No seed rows: a layer only arrives through an import run, and points at a real data source.
 * The area link is ON DELETE CASCADE, like rainfall: clearing a level to re-import its boundaries
 * clears that level's figures, and the map itself is unaffected.
 */
export class CreateFloodRiskLayers1792700000000 implements MigrationInterface {
  name = "CreateFloodRiskLayers1792700000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE flood_risk_layers (
        id               uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code     char(3)          NOT NULL,
        import_run_id    uuid,
        source_id        uuid             NOT NULL,
        status           varchar(10)      NOT NULL,
        data_type        varchar(12)      NOT NULL DEFAULT 'DERIVED',
        title            varchar(200)     NOT NULL,
        source_crs       varchar(20)      NOT NULL,
        cell_size_m      double precision NOT NULL,
        grid_width       integer          NOT NULL,
        grid_height      integer          NOT NULL,
        grid_origin_e    double precision NOT NULL,
        grid_origin_n    double precision NOT NULL,
        grid_gz          bytea            NOT NULL,
        class_cells      integer[]        NOT NULL,
        image_png        bytea            NOT NULL,
        image_width      integer          NOT NULL,
        image_height     integer          NOT NULL,
        west             double precision NOT NULL,
        south            double precision NOT NULL,
        east             double precision NOT NULL,
        north            double precision NOT NULL,
        created_by       uuid             NOT NULL,
        created_at       timestamptz      NOT NULL DEFAULT now(),
        promoted_at      timestamptz,
        CONSTRAINT ck_flood_risk_layers_status CHECK (status IN ('staged', 'live', 'retired')),
        CONSTRAINT ck_flood_risk_layers_data_type CHECK (data_type IN ('OBSERVED', 'DERIVED', 'MODELLED', 'ESTIMATED', 'SYNTHETIC')),
        CONSTRAINT ck_flood_risk_layers_class_cells CHECK (cardinality(class_cells) = 5),
        CONSTRAINT ck_flood_risk_layers_corners CHECK (west < east AND south < north),
        CONSTRAINT uq_flood_risk_layers_import_run UNIQUE (import_run_id),
        CONSTRAINT fk_flood_risk_layers_country FOREIGN KEY (country_code) REFERENCES countries (country_code) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_flood_risk_layers_source FOREIGN KEY (source_id) REFERENCES data_sources (id) ON DELETE RESTRICT,
        CONSTRAINT fk_flood_risk_layers_import_run FOREIGN KEY (import_run_id) REFERENCES import_runs (id) ON DELETE SET NULL,
        CONSTRAINT fk_flood_risk_layers_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX uq_flood_risk_layers_live ON flood_risk_layers (country_code) WHERE status = 'live'`);

    await queryRunner.query(`
      CREATE TABLE admin_unit_flood_risk (
        id            uuid      PRIMARY KEY DEFAULT gen_random_uuid(),
        layer_id      uuid      NOT NULL,
        admin_unit_id uuid      NOT NULL,
        class_cells   integer[] NOT NULL,
        CONSTRAINT uq_admin_unit_flood_risk_layer_unit UNIQUE (layer_id, admin_unit_id),
        CONSTRAINT ck_admin_unit_flood_risk_class_cells CHECK (cardinality(class_cells) = 5),
        CONSTRAINT fk_admin_unit_flood_risk_layer FOREIGN KEY (layer_id) REFERENCES flood_risk_layers (id) ON DELETE CASCADE,
        CONSTRAINT fk_admin_unit_flood_risk_admin_unit FOREIGN KEY (admin_unit_id) REFERENCES admin_units (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_admin_unit_flood_risk_unit ON admin_unit_flood_risk (admin_unit_id)`);

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

  /** Fails if a flood risk import run exists: delete those runs first, since the old rules can't hold them. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE admin_unit_flood_risk`);
    await queryRunner.query(`DROP TABLE flood_risk_layers`);
    await queryRunner.query(`ALTER TABLE import_runs DROP CONSTRAINT ck_import_runs_target`);
    await queryRunner.query(`
      ALTER TABLE import_runs
        ADD CONSTRAINT ck_import_runs_target CHECK (target IN ('admin_units', 'rainfall_observations'))
    `);
    await queryRunner.query(`ALTER TABLE import_runs DROP CONSTRAINT ck_import_runs_file_type`);
    await queryRunner.query(`
      ALTER TABLE import_runs
        ADD CONSTRAINT ck_import_runs_file_type CHECK (file_type IN ('xlsx', 'geojson', 'shapefile', 'csv'))
    `);
  }
}
