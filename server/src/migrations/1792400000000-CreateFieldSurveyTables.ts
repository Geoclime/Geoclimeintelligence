import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Field survey: what a responder records on the ground during a flood.
 *
 * flood_extents: the reach of a flood, as a shape walked with GPS or drawn on the map. Its area and
 * perimeter are measured in PostGIS on the spheroid (geography), never trusted from the browser. A
 * self-crossing walk is repaired into a MultiPolygon rather than refused. Once the water goes down
 * the row is marked receded (receded_at) and kept as a record.
 *
 * drainage_features: drains, culverts, outfalls, inlets and ponds, a line for something walked
 * along and a point for something at one spot, with the condition last seen (clear ... blocked) and
 * when (last_checked_at), so a blocked drain beside a flood can be found and fixed.
 *
 * Both link to the ward and LGA at their middle (null outside every loaded area, which the API
 * refuses anyway), keep the recorder (SET NULL when that account is deleted: the record outlives
 * it), and use the same SRID, validity check and GiST index as the map-layer tables. The country is
 * RESTRICT, as for the layers.
 */
export class CreateFieldSurveyTables1792400000000 implements MigrationInterface {
  name = "CreateFieldSurveyTables1792400000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE flood_extents (
        id           uuid                         PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code char(3)                      NOT NULL,
        ward_id      uuid,
        lga_id       uuid,
        geom         geometry(MultiPolygon, 4326) NOT NULL,
        area_m2      double precision             NOT NULL,
        perimeter_m  double precision             NOT NULL,
        method       varchar(6)                   NOT NULL,
        depth        varchar(12),
        note         varchar(500),
        point_count  integer                      NOT NULL,
        accuracy_m   real,
        observed_at  timestamptz                  NOT NULL DEFAULT now(),
        receded_at   timestamptz,
        recorded_by  uuid,
        created_at   timestamptz                  NOT NULL DEFAULT now(),
        updated_at   timestamptz                  NOT NULL DEFAULT now(),
        CONSTRAINT ck_flood_extents_method CHECK (method IN ('walked', 'drawn')),
        CONSTRAINT ck_flood_extents_depth CHECK (depth IS NULL OR depth IN ('ankle', 'knee', 'waist', 'chest', 'impassable')),
        CONSTRAINT ck_flood_extents_geom_valid CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom)),
        CONSTRAINT ck_flood_extents_size CHECK (area_m2 > 0 AND perimeter_m > 0 AND point_count >= 3),
        CONSTRAINT fk_flood_extents_country FOREIGN KEY (country_code) REFERENCES countries (country_code) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_flood_extents_ward FOREIGN KEY (ward_id) REFERENCES admin_units (id) ON DELETE SET NULL,
        CONSTRAINT fk_flood_extents_lga FOREIGN KEY (lga_id) REFERENCES admin_units (id) ON DELETE SET NULL,
        CONSTRAINT fk_flood_extents_recorded_by FOREIGN KEY (recorded_by) REFERENCES users (id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_flood_extents_geom ON flood_extents USING GIST (geom)`);
    await queryRunner.query(`CREATE INDEX idx_flood_extents_observed ON flood_extents (observed_at DESC)`);

    await queryRunner.query(`
      CREATE TABLE drainage_features (
        id              uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
        country_code    char(3)                  NOT NULL,
        ward_id         uuid,
        lga_id          uuid,
        kind            varchar(16)              NOT NULL,
        condition       varchar(14)              NOT NULL,
        name            varchar(120),
        geom            geometry(Geometry, 4326) NOT NULL,
        width_m         double precision,
        depth_m         double precision,
        length_m        double precision,
        note            varchar(500),
        method          varchar(6)               NOT NULL,
        last_checked_at timestamptz              NOT NULL DEFAULT now(),
        recorded_by     uuid,
        created_at      timestamptz              NOT NULL DEFAULT now(),
        updated_at      timestamptz              NOT NULL DEFAULT now(),
        CONSTRAINT ck_drainage_kind CHECK (kind IN ('open_drain', 'covered_drain', 'culvert', 'outfall', 'inlet', 'retention_pond')),
        CONSTRAINT ck_drainage_condition CHECK (condition IN ('clear', 'partly_blocked', 'blocked', 'overflowing', 'damaged')),
        CONSTRAINT ck_drainage_method CHECK (method IN ('walked', 'drawn')),
        CONSTRAINT ck_drainage_geom_type CHECK (GeometryType(geom) IN ('POINT', 'LINESTRING')),
        CONSTRAINT ck_drainage_geom_valid CHECK (ST_IsValid(geom) AND NOT ST_IsEmpty(geom)),
        CONSTRAINT ck_drainage_size CHECK ((width_m IS NULL OR (width_m > 0 AND width_m <= 100)) AND (depth_m IS NULL OR (depth_m > 0 AND depth_m <= 100))),
        CONSTRAINT fk_drainage_country FOREIGN KEY (country_code) REFERENCES countries (country_code) ON UPDATE CASCADE ON DELETE RESTRICT,
        CONSTRAINT fk_drainage_ward FOREIGN KEY (ward_id) REFERENCES admin_units (id) ON DELETE SET NULL,
        CONSTRAINT fk_drainage_lga FOREIGN KEY (lga_id) REFERENCES admin_units (id) ON DELETE SET NULL,
        CONSTRAINT fk_drainage_recorded_by FOREIGN KEY (recorded_by) REFERENCES users (id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_drainage_geom ON drainage_features USING GIST (geom)`);
    await queryRunner.query(`CREATE INDEX idx_drainage_condition ON drainage_features (condition)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE drainage_features`);
    await queryRunner.query(`DROP TABLE flood_extents`);
  }
}
