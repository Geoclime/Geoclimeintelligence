import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * A flood outlook looks any number of days ahead (1 to 30), no longer just "7d" or "seasonal".
 *
 * - `flood_predictions.horizon` (text) becomes `horizon_days` (smallint). Existing rows keep their
 *   meaning: '7d' becomes 7 and 'seasonal' becomes 30. There is one row per area and number of days.
 * - `platform_settings.public_outlook_horizon` becomes `public_outlook_days` the same way.
 *
 * Dropping the old columns also drops the unique constraint, check constraints and index that used them.
 * `down` puts the text columns back; it keeps only the 7 and 30-day rows, as nothing else fits there.
 */
export class FloodOutlookInDays1793600000000 implements MigrationInterface {
  name = "FloodOutlookInDays1793600000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE flood_predictions ADD COLUMN horizon_days smallint`);
    await queryRunner.query(`UPDATE flood_predictions SET horizon_days = CASE horizon WHEN 'seasonal' THEN 30 ELSE 7 END`);
    await queryRunner.query(`ALTER TABLE flood_predictions ALTER COLUMN horizon_days SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE flood_predictions ALTER COLUMN horizon_days SET DEFAULT 7`);
    await queryRunner.query(`ALTER TABLE flood_predictions DROP COLUMN horizon`);
    await queryRunner.query(`
      ALTER TABLE flood_predictions
        ADD CONSTRAINT uq_flood_predictions_unit_days UNIQUE (admin_unit_id, horizon_days),
        ADD CONSTRAINT ck_flood_predictions_days CHECK (horizon_days BETWEEN 1 AND 30)
    `);
    await queryRunner.query(
      `CREATE INDEX idx_flood_predictions_country_days ON flood_predictions (country_code, horizon_days, likelihood_score DESC)`,
    );

    await queryRunner.query(`ALTER TABLE platform_settings ADD COLUMN public_outlook_days smallint NOT NULL DEFAULT 7`);
    await queryRunner.query(
      `UPDATE platform_settings SET public_outlook_days = CASE public_outlook_horizon WHEN 'seasonal' THEN 30 ELSE 7 END`,
    );
    await queryRunner.query(`ALTER TABLE platform_settings DROP COLUMN public_outlook_horizon`);
    await queryRunner.query(
      `ALTER TABLE platform_settings ADD CONSTRAINT ck_platform_settings_days CHECK (public_outlook_days BETWEEN 1 AND 30)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE platform_settings DROP CONSTRAINT ck_platform_settings_days`);
    await queryRunner.query(`ALTER TABLE platform_settings ADD COLUMN public_outlook_horizon varchar(12) NOT NULL DEFAULT '7d'`);
    await queryRunner.query(
      `UPDATE platform_settings SET public_outlook_horizon = CASE WHEN public_outlook_days = 30 THEN 'seasonal' ELSE '7d' END`,
    );
    await queryRunner.query(`ALTER TABLE platform_settings DROP COLUMN public_outlook_days`);
    await queryRunner.query(
      `ALTER TABLE platform_settings ADD CONSTRAINT ck_platform_settings_horizon CHECK (public_outlook_horizon IN ('7d', 'seasonal'))`,
    );

    await queryRunner.query(`DELETE FROM flood_predictions WHERE horizon_days NOT IN (7, 30)`);
    await queryRunner.query(`ALTER TABLE flood_predictions ADD COLUMN horizon varchar(12) NOT NULL DEFAULT '7d'`);
    await queryRunner.query(`UPDATE flood_predictions SET horizon = CASE WHEN horizon_days = 30 THEN 'seasonal' ELSE '7d' END`);
    await queryRunner.query(`ALTER TABLE flood_predictions DROP COLUMN horizon_days`);
    await queryRunner.query(`
      ALTER TABLE flood_predictions
        ADD CONSTRAINT uq_flood_predictions_unit_horizon UNIQUE (admin_unit_id, horizon),
        ADD CONSTRAINT ck_flood_predictions_horizon CHECK (horizon IN ('7d', 'seasonal'))
    `);
    await queryRunner.query(
      `CREATE INDEX idx_flood_predictions_country_horizon ON flood_predictions (country_code, horizon, likelihood_score DESC)`,
    );
  }
}
