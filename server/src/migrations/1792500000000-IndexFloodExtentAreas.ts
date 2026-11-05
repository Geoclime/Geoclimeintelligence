import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * A place's flood history (the Flood history card on an LGA's page) asks "every flood recorded in this
 * LGA or ward, newest first". These two indexes answer it without reading every flood ever recorded,
 * which matters once the platform has a few seasons of them.
 */
export class IndexFloodExtentAreas1792500000000 implements MigrationInterface {
  name = "IndexFloodExtentAreas1792500000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX idx_flood_extents_lga ON flood_extents (lga_id, observed_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_flood_extents_ward ON flood_extents (ward_id, observed_at DESC)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_flood_extents_ward`);
    await queryRunner.query(`DROP INDEX idx_flood_extents_lga`);
  }
}
