import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * A place's drainage (the Drainage card on an LGA's or ward's page) asks "every drain in this LGA or ward,
 * the worst first". These two indexes answer it without reading every drain ever recorded.
 */
export class IndexDrainageAreas1792600000000 implements MigrationInterface {
  name = "IndexDrainageAreas1792600000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX idx_drainage_lga ON drainage_features (lga_id, last_checked_at)`);
    await queryRunner.query(`CREATE INDEX idx_drainage_ward ON drainage_features (ward_id, last_checked_at)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_drainage_ward`);
    await queryRunner.query(`DROP INDEX idx_drainage_lga`);
  }
}
