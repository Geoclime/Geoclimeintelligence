import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Two pre-simplified copies of every waterway's shape, for the zoomed-out map.
 *
 * Wide rivers are stored as outlines with hundreds of thousands of vertices between them, and
 * simplifying those live for a whole-state view took over a second of database time on every
 * request: the slowest part of the map's first screen. The copies are generated columns, so
 * PostgreSQL keeps them in step with `geom` itself, on every insert and update, and the loader
 * needs no change.
 *
 * Each is simplified to about one screen pixel at the zoom in its name (512 px tiles, the rule in
 * layer-rules.ts simplifyTolerance: 180 / (512 * 2^zoom)):
 *   geom_z8   for zoom 8 and below  (0.001373291015625 degrees)
 *   geom_z10  for zoom 10 and 11    (0.00034332275390625 degrees)
 * waterwayGeometryColumn in layer-rules.ts says which one a request reads. From zoom 12 the view
 * is small enough to simplify live from `geom`.
 */
export class AddSimplifiedWaterways1792200000000 implements MigrationInterface {
  name = "AddSimplifiedWaterways1792200000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE waterways
        ADD COLUMN geom_z8 geometry(Geometry, 4326)
          GENERATED ALWAYS AS (ST_SimplifyPreserveTopology(geom, 0.001373291015625)) STORED,
        ADD COLUMN geom_z10 geometry(Geometry, 4326)
          GENERATED ALWAYS AS (ST_SimplifyPreserveTopology(geom, 0.00034332275390625)) STORED
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE waterways DROP COLUMN geom_z10, DROP COLUMN geom_z8`);
  }
}
