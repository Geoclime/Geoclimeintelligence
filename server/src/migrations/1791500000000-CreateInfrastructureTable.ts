import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The Backlog2 ERD's INFRASTRUCTURE table: facilities people depend on in an emergency (clinics,
 * schools, police, markets, ferry terminals, water points...), from Geofabrik's OpenStreetMap
 * extract. No seed rows: the map-layer loader (npm run layers:load -- --infrastructure) fills it,
 * and every row points at a real data source.
 *
 * Same rules as the other map-layer tables: SRID 4326, a validity gate behind the loader's checks,
 * a GiST index, ON DELETE RESTRICT on the source and the country. Like settlement_points, the
 * ward link is nullable with ON DELETE SET NULL, so clearing and re-importing wards never fails;
 * the next loader run links the facilities again.
 *
 * Differences from the ERD sketch: `osm_class` keeps the raw OSM class beside the broader
 * `facility_type`, and `from_area` records that a facility mapped as an outline is stored as a
 * point inside it. OSM numbers nodes and ways separately, so the key is (osm_id, from_area).
 */
export class CreateInfrastructureTable1791500000000 implements MigrationInterface {
  name = "CreateInfrastructureTable1791500000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE infrastructure (
        id            uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code  char(3)               NOT NULL,
        admin_unit_id uuid,
        osm_id        varchar(40)           NOT NULL,
        from_area     boolean               NOT NULL DEFAULT false,
        name          varchar(200),
        facility_type varchar(20)           NOT NULL,
        osm_class     varchar(40)           NOT NULL,
        geom          geometry(Point, 4326) NOT NULL,
        source_id     uuid                  NOT NULL,
        created_at    timestamptz           NOT NULL DEFAULT now(),
        updated_at    timestamptz           NOT NULL DEFAULT now(),
        CONSTRAINT uq_infrastructure_osm UNIQUE (osm_id, from_area),
        CONSTRAINT ck_infrastructure_type CHECK (facility_type IN
          ('health', 'emergency', 'education', 'government', 'market', 'transport', 'community', 'worship', 'water', 'telecom')),
        CONSTRAINT ck_infrastructure_geom_valid CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom)),
        CONSTRAINT fk_infrastructure_country FOREIGN KEY (country_code) REFERENCES countries (country_code) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_infrastructure_admin_unit FOREIGN KEY (admin_unit_id) REFERENCES admin_units (id) ON DELETE SET NULL,
        CONSTRAINT fk_infrastructure_source FOREIGN KEY (source_id) REFERENCES data_sources (id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_infrastructure_geom ON infrastructure USING GIST (geom)`);
    await queryRunner.query(`CREATE INDEX idx_infrastructure_country_type ON infrastructure (country_code, facility_type)`);
    await queryRunner.query(`CREATE INDEX idx_infrastructure_admin_unit ON infrastructure (admin_unit_id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE infrastructure`);
  }
}
