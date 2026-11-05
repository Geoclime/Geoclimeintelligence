import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The Backlog2 ERD's BUILDINGS table: building outlines from Geofabrik's OpenStreetMap extract
 * (about 414,000 for Rivers State). They are the exposure layer: what a flood zone or a ward
 * would put at risk. No seed rows: the map-layer loader (npm run layers:load -- --buildings)
 * fills it, and every row points at a real data source.
 *
 * Same rules as the other map-layer tables: SRID 4326, a validity gate behind the loader's
 * checks, a GiST index, ON DELETE RESTRICT on the source and the country. The ward link is
 * nullable with ON DELETE SET NULL, like settlements and infrastructure, so clearing and
 * re-importing wards never fails; the next loader run links the buildings again.
 *
 * Differences from the ERD sketch: the shape is a MultiPolygon (a repaired outline can split in
 * two), and `building_type` keeps the OSM building tag where it says more than "yes".
 */
export class CreateBuildingsTable1791500100000 implements MigrationInterface {
  name = "CreateBuildingsTable1791500100000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE buildings (
        id            uuid                         PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code  char(3)                      NOT NULL,
        admin_unit_id uuid,
        osm_id        varchar(40)                  NOT NULL,
        name          varchar(200),
        building_type varchar(40),
        geom          geometry(MultiPolygon, 4326) NOT NULL,
        source_id     uuid                         NOT NULL,
        created_at    timestamptz                  NOT NULL DEFAULT now(),
        updated_at    timestamptz                  NOT NULL DEFAULT now(),
        CONSTRAINT uq_buildings_osm_id UNIQUE (osm_id),
        CONSTRAINT ck_buildings_geom_valid CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom)),
        CONSTRAINT fk_buildings_country FOREIGN KEY (country_code) REFERENCES countries (country_code) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_buildings_admin_unit FOREIGN KEY (admin_unit_id) REFERENCES admin_units (id) ON DELETE SET NULL,
        CONSTRAINT fk_buildings_source FOREIGN KEY (source_id) REFERENCES data_sources (id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_buildings_geom ON buildings USING GIST (geom)`);
    await queryRunner.query(`CREATE INDEX idx_buildings_admin_unit ON buildings (admin_unit_id)`);
    await queryRunner.query(`CREATE INDEX idx_buildings_country ON buildings (country_code)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE buildings`);
  }
}
