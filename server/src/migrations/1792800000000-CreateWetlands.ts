import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Wetlands: mangrove, swamp, marsh and tidal flats from Geofabrik's OpenStreetMap water areas file,
 * the low wet ground a flood spreads over first (docs/map-layers.md, "Wetlands").
 *
 * Like waterways, each shape keeps two pre-simplified copies as generated columns, so a zoomed-out
 * view never simplifies a mangrove outline live (layer-rules.ts wetlandGeometryColumn):
 *   geom_z8   for zoom 8 and below  (0.001373291015625 degrees)
 *   geom_z10  for zoom 10 and 11    (0.00034332275390625 degrees)
 * Rows belong to a country (`ON DELETE RESTRICT`), so a country holding wetlands can't be deleted
 * until `npm run layers:clear -- --layers wetlands` has removed them.
 */
export class CreateWetlands1792800000000 implements MigrationInterface {
  name = "CreateWetlands1792800000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE wetlands (
        id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code  char(3)      NOT NULL,
        osm_id        varchar(40)  NOT NULL,
        name          varchar(200),
        wetland_class varchar(12)  NOT NULL,
        osm_class     varchar(40)  NOT NULL,
        geom          geometry(MultiPolygon, 4326) NOT NULL,
        geom_z8       geometry(Geometry, 4326) GENERATED ALWAYS AS (ST_SimplifyPreserveTopology(geom, 0.001373291015625)) STORED,
        geom_z10      geometry(Geometry, 4326) GENERATED ALWAYS AS (ST_SimplifyPreserveTopology(geom, 0.00034332275390625)) STORED,
        source_id     uuid         NOT NULL,
        created_at    timestamptz  NOT NULL DEFAULT now(),
        updated_at    timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT uq_wetlands_osm_id UNIQUE (osm_id),
        CONSTRAINT fk_wetlands_country FOREIGN KEY (country_code) REFERENCES countries (country_code) ON DELETE RESTRICT,
        CONSTRAINT fk_wetlands_source FOREIGN KEY (source_id) REFERENCES data_sources (id) ON DELETE RESTRICT,
        CONSTRAINT ck_wetlands_class CHECK (wetland_class IN ('mangrove', 'swamp', 'marsh', 'tidal_flat', 'wet_meadow', 'wetland')),
        CONSTRAINT ck_wetlands_geom_valid CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom))
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_wetlands_geom ON wetlands USING GIST (geom)`);
    await queryRunner.query(`CREATE INDEX idx_wetlands_country_class ON wetlands (country_code, wetland_class)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE wetlands`);
  }
}
