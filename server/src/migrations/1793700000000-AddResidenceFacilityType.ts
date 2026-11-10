import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Residences and private firms can be saved on the map like any other place: `infrastructure.facility_type`
 * accepts 'residence' (a house or compound, an apartment block) and 'business' (a private firm, an office,
 * another business establishment). Only the check constraint changes; no rows do.
 * `down` puts the old list back, so it refuses while any of them is saved (delete or re-file those first).
 */
export class AddResidenceFacilityType1793700000000 implements MigrationInterface {
  name = "AddResidenceFacilityType1793700000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE infrastructure DROP CONSTRAINT ck_infrastructure_type`);
    await queryRunner.query(`
      ALTER TABLE infrastructure ADD CONSTRAINT ck_infrastructure_type CHECK (facility_type IN
        ('health', 'emergency', 'education', 'government', 'market', 'transport', 'community', 'worship', 'water', 'telecom', 'residence', 'business'))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE infrastructure DROP CONSTRAINT ck_infrastructure_type`);
    await queryRunner.query(`
      ALTER TABLE infrastructure ADD CONSTRAINT ck_infrastructure_type CHECK (facility_type IN
        ('health', 'emergency', 'education', 'government', 'market', 'transport', 'community', 'worship', 'water', 'telecom'))
    `);
  }
}
