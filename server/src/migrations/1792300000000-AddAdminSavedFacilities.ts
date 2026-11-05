import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Lets an administrator save a facility straight from the map (a hospital the OpenStreetMap extract
 * missed), in the same `infrastructure` table the import fills, so it is drawn and counted like any
 * other facility.
 *
 * - `origin` tells the two apart: 'import' for loader rows, 'manual' for places saved by hand.
 *   layers:clear and a re-import only ever touch 'import' rows, so a saved place is never lost.
 * - `osm_id` becomes optional, because a place saved by hand has none. The new check keeps it
 *   required for every imported row, so the loader's (osm_id, from_area) key still means something.
 * - `note` is free text from whoever saved the place; `created_by` says who (kept, set to null,
 *   if that user is later deleted).
 *
 * `source_id` stays required: places saved by hand point at one standing data source, created the
 * first time an administrator saves one, so provenance still reaches every row.
 */
export class AddAdminSavedFacilities1792300000000 implements MigrationInterface {
  name = "AddAdminSavedFacilities1792300000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE infrastructure
        ADD COLUMN origin     varchar(10) NOT NULL DEFAULT 'import',
        ADD COLUMN note       varchar(500),
        ADD COLUMN created_by uuid,
        ALTER COLUMN osm_id DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE infrastructure
        ADD CONSTRAINT ck_infrastructure_origin CHECK (origin IN ('import', 'manual')),
        ADD CONSTRAINT ck_infrastructure_osm_id CHECK (origin = 'manual' OR osm_id IS NOT NULL),
        ADD CONSTRAINT fk_infrastructure_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Rolling back drops the places saved by hand: the old table has no room for a row with no OSM id.
    await queryRunner.query(`DELETE FROM infrastructure WHERE origin = 'manual'`);
    await queryRunner.query(`
      ALTER TABLE infrastructure
        DROP CONSTRAINT fk_infrastructure_created_by,
        DROP CONSTRAINT ck_infrastructure_osm_id,
        DROP CONSTRAINT ck_infrastructure_origin
    `);
    await queryRunner.query(`
      ALTER TABLE infrastructure
        ALTER COLUMN osm_id SET NOT NULL,
        DROP COLUMN created_by,
        DROP COLUMN note,
        DROP COLUMN origin
    `);
  }
}
