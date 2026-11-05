import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * More of what a drain is, so the map can show where the water goes and a culvert can be sized:
 *  - `flow_direction` (lines only): which way the water runs along the recorded line. `with_line` is
 *    from the first point to the last, the way it was walked or tapped; `against_line` the other way.
 *    Null means nobody said. The map turns `against_line` drains round and draws arrows downstream.
 *  - `diameter_m`, `material`, `barrels` (culverts mostly, any spot may have them): the pipe's inside
 *    width, what it is made of, and how many pipes side by side carry the water.
 *  - `method` gains `import`: a drain loaded from a drainage plan file (DrainageImportService), not
 *    walked or drawn by hand.
 */
export class AddDrainageDetails1792900000000 implements MigrationInterface {
  name = "AddDrainageDetails1792900000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE drainage_features
        ADD COLUMN flow_direction varchar(12),
        ADD COLUMN diameter_m     double precision,
        ADD COLUMN material       varchar(12),
        ADD COLUMN barrels        smallint,
        ADD COLUMN source_ref     varchar(100),
        ADD CONSTRAINT ck_drainage_flow CHECK (
          flow_direction IS NULL OR (flow_direction IN ('with_line', 'against_line') AND GeometryType(geom) = 'LINESTRING')
        ),
        ADD CONSTRAINT ck_drainage_diameter CHECK (diameter_m IS NULL OR (diameter_m > 0 AND diameter_m <= 20)),
        ADD CONSTRAINT ck_drainage_material CHECK (material IS NULL OR material IN ('concrete', 'masonry', 'plastic', 'metal', 'earth', 'other')),
        ADD CONSTRAINT ck_drainage_barrels CHECK (barrels IS NULL OR barrels BETWEEN 1 AND 20),
        DROP CONSTRAINT ck_drainage_method,
        ADD CONSTRAINT ck_drainage_method CHECK (method IN ('walked', 'drawn', 'import'))
    `);
    // An imported plan names each drain by its own reference, so loading the same file twice adds nothing twice.
    await queryRunner.query(`CREATE UNIQUE INDEX uq_drainage_source_ref ON drainage_features (source_ref) WHERE source_ref IS NOT NULL`);
  }

  /** Fails while imported drains exist: delete them first, since `import` is no longer a method afterwards. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX uq_drainage_source_ref`);
    await queryRunner.query(`
      ALTER TABLE drainage_features
        DROP CONSTRAINT ck_drainage_method,
        ADD CONSTRAINT ck_drainage_method CHECK (method IN ('walked', 'drawn')),
        DROP CONSTRAINT ck_drainage_barrels,
        DROP CONSTRAINT ck_drainage_material,
        DROP CONSTRAINT ck_drainage_diameter,
        DROP CONSTRAINT ck_drainage_flow,
        DROP COLUMN source_ref,
        DROP COLUMN barrels,
        DROP COLUMN material,
        DROP COLUMN diameter_m,
        DROP COLUMN flow_direction
    `);
  }
}
