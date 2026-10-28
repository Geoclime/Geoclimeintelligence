import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Phase 3 map layers: the three feature tables from the Backlog2 ERD that the MVP map needs
 * (roads, waterways, settlement points).
 *
 * No seed rows. The map-layer loader script (npm run layers:load) fills them from the data
 * team's files, and every row points at a real data source (source_id NOT NULL).
 *
 * Each table follows the admin_units rules: SRID 4326 end to end, a second validity gate behind
 * the loader's checks, a GiST index on the shape, and ON DELETE RESTRICT on sources so a source
 * can't be removed from under its data. Two deliberate differences from the ERD sketch:
 *  - settlement_points.admin_unit_id is nullable with ON DELETE SET NULL, so clearing and
 *    re-importing the wards (a feature of the Countries page) never fails or deletes settlements;
 *  - roads.class_rank is stored, so the zoom filter is an indexed comparison.
 */
export class CreateMapLayerTables1791400000000 implements MigrationInterface {
  name = "CreateMapLayerTables1791400000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE settlement_points (
        id                     uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_unit_id          uuid,
        source_settlement_code varchar(50)           NOT NULL,
        source_ward_code       varchar(100)          NOT NULL,
        settlement_name        varchar(200)          NOT NULL,
        is_primary             boolean               NOT NULL DEFAULT false,
        data_origin            varchar(100),
        geom                   geometry(Point, 4326) NOT NULL,
        source_id              uuid                  NOT NULL,
        created_at             timestamptz           NOT NULL DEFAULT now(),
        updated_at             timestamptz           NOT NULL DEFAULT now(),
        CONSTRAINT uq_settlement_points_code UNIQUE (source_settlement_code),
        CONSTRAINT ck_settlement_points_name CHECK (length(trim(settlement_name)) > 0),
        CONSTRAINT ck_settlement_points_geom_valid CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom)),
        CONSTRAINT fk_settlement_points_admin_unit FOREIGN KEY (admin_unit_id) REFERENCES admin_units (id) ON DELETE SET NULL,
        CONSTRAINT fk_settlement_points_source FOREIGN KEY (source_id) REFERENCES data_sources (id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_settlement_points_geom ON settlement_points USING GIST (geom)`);
    await queryRunner.query(`CREATE INDEX idx_settlement_points_admin_unit ON settlement_points (admin_unit_id)`);

    await queryRunner.query(`
      CREATE TABLE roads (
        id           uuid                            PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code char(3)                         NOT NULL,
        osm_id       varchar(40)                     NOT NULL,
        name         varchar(200),
        road_class   varchar(40)                     NOT NULL,
        class_rank   smallint                        NOT NULL,
        surface      varchar(40),
        smoothness   varchar(40),
        width        varchar(40),
        lanes        varchar(40),
        oneway       varchar(40),
        is_bridge    boolean                         NOT NULL DEFAULT false,
        geom         geometry(MultiLineString, 4326) NOT NULL,
        source_id    uuid                            NOT NULL,
        created_at   timestamptz                     NOT NULL DEFAULT now(),
        updated_at   timestamptz                     NOT NULL DEFAULT now(),
        CONSTRAINT uq_roads_osm_id UNIQUE (osm_id),
        CONSTRAINT ck_roads_class_rank CHECK (class_rank BETWEEN 1 AND 8),
        CONSTRAINT ck_roads_geom_valid CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom)),
        CONSTRAINT fk_roads_country FOREIGN KEY (country_code) REFERENCES countries (country_code) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_roads_source FOREIGN KEY (source_id) REFERENCES data_sources (id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_roads_geom ON roads USING GIST (geom)`);
    await queryRunner.query(`CREATE INDEX idx_roads_country_rank ON roads (country_code, class_rank)`);

    await queryRunner.query(`
      CREATE TABLE waterways (
        id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code  char(3)      NOT NULL,
        osm_id        varchar(40)  NOT NULL,
        name          varchar(200),
        waterway_type varchar(40),
        water_tag     varchar(40),
        water_class   varchar(10)  NOT NULL,
        class_basis   varchar(20)  NOT NULL,
        tunnel        varchar(40),
        covered       varchar(40),
        width         varchar(40),
        -- Lines (rivers, creeks) and areas (wide rivers, water bodies) share the table, as in the ERD.
        geom          geometry(Geometry, 4326) NOT NULL,
        source_id     uuid         NOT NULL,
        created_at    timestamptz  NOT NULL DEFAULT now(),
        updated_at    timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_waterways_osm_id UNIQUE (osm_id),
        CONSTRAINT ck_waterways_class CHECK (water_class IN ('river', 'creek', 'other')),
        CONSTRAINT ck_waterways_geom_type CHECK (GeometryType(geom) IN ('MULTILINESTRING', 'MULTIPOLYGON')),
        CONSTRAINT ck_waterways_geom_valid CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom)),
        CONSTRAINT fk_waterways_country FOREIGN KEY (country_code) REFERENCES countries (country_code) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_waterways_source FOREIGN KEY (source_id) REFERENCES data_sources (id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_waterways_geom ON waterways USING GIST (geom)`);
    await queryRunner.query(`CREATE INDEX idx_waterways_country_class ON waterways (country_code, water_class)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE waterways`);
    await queryRunner.query(`DROP TABLE roads`);
    await queryRunner.query(`DROP TABLE settlement_points`);
  }
}
