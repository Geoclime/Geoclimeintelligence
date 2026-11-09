import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * AI credentials, AI usage logs, flood predictions and platform settings for public flood outlook.
 *
 * - `ai_credentials`: stores encrypted API keys (`seal` / `open` in secret-box.ts) per user or
 *   for the platform (`user_id IS NULL`).
 * - `ai_usage_logs`: append-only token and latency record per AI call (never stores prompt/reply).
 * - `flood_predictions`: stores 7-day and seasonal flood outlook scores, forecast rain, river
 *   discharge, driver breakdowns, and optional AI narrative per admin unit. Always `data_type = 'MODELLED'`.
 * - `platform_settings`: single-row configuration table holding `show_public_flood_outlook` and
 *   `public_outlook_horizon`.
 */
export class CreateAiAndFloodPredictions1793500000000 implements MigrationInterface {
  name = "CreateAiAndFloodPredictions1793500000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE ai_credentials (
        id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id         uuid,
        provider        varchar(20)  NOT NULL,
        model           varchar(120) NOT NULL,
        chat_model      varchar(120),
        feature_models  jsonb        NOT NULL DEFAULT '{}'::jsonb,
        base_url        varchar(300),
        key_ciphertext  text         NOT NULL,
        key_last4       varchar(12)  NOT NULL,
        is_active       boolean      NOT NULL DEFAULT false,
        updated_by      uuid         NOT NULL,
        created_at      timestamptz  NOT NULL DEFAULT now(),
        updated_at      timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT ck_ai_credentials_provider CHECK (provider IN ('anthropic', 'openai', 'gemini', 'ollama')),
        CONSTRAINT fk_ai_credentials_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        CONSTRAINT fk_ai_credentials_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_ai_credentials_platform ON ai_credentials (provider) WHERE user_id IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_ai_credentials_user ON ai_credentials (user_id, provider) WHERE user_id IS NOT NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE ai_usage_logs (
        id            uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       uuid         NOT NULL,
        key_source    varchar(12)  NOT NULL,
        provider      varchar(20)  NOT NULL,
        model         varchar(120) NOT NULL,
        feature       varchar(60)  NOT NULL,
        input_tokens  integer      NOT NULL DEFAULT 0,
        output_tokens integer      NOT NULL DEFAULT 0,
        status        varchar(10)  NOT NULL,
        error_kind    varchar(40),
        duration_ms   integer      NOT NULL DEFAULT 0,
        created_at    timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT ck_ai_usage_logs_source CHECK (key_source IN ('user', 'platform')),
        CONSTRAINT ck_ai_usage_logs_status CHECK (status IN ('ok', 'error')),
        CONSTRAINT fk_ai_usage_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_ai_usage_logs_user_created ON ai_usage_logs (user_id, created_at DESC)`);

    await queryRunner.query(`
      CREATE TABLE flood_predictions (
        id                      uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_unit_id           uuid           NOT NULL,
        country_code            char(3)        NOT NULL,
        horizon                 varchar(12)    NOT NULL DEFAULT '7d',
        valid_from              timestamptz    NOT NULL,
        valid_to                timestamptz    NOT NULL,
        risk_level              varchar(12)    NOT NULL,
        likelihood_score        smallint       NOT NULL,
        forecast_rainfall_mm    numeric(8, 2)  NOT NULL DEFAULT 0,
        peak_daily_rainfall_mm  numeric(8, 2)  NOT NULL DEFAULT 0,
        peak_day_date           char(10),
        river_discharge_m3s     numeric(10, 2),
        river_discharge_ratio   numeric(6, 2),
        daily_forecast          jsonb          NOT NULL DEFAULT '[]'::jsonb,
        drivers                 jsonb          NOT NULL DEFAULT '{}'::jsonb,
        ai_summary              text,
        ai_preparedness         jsonb          NOT NULL DEFAULT '[]'::jsonb,
        ai_caveats              text,
        ai_provider             varchar(20),
        ai_model                varchar(120),
        data_type               varchar(12)    NOT NULL DEFAULT 'MODELLED',
        weather_provider        varchar(120)   NOT NULL DEFAULT 'Open-Meteo & GloFAS',
        created_at              timestamptz    NOT NULL DEFAULT now(),
        updated_at              timestamptz    NOT NULL DEFAULT now(),
        CONSTRAINT uq_flood_predictions_unit_horizon UNIQUE (admin_unit_id, horizon),
        CONSTRAINT ck_flood_predictions_horizon CHECK (horizon IN ('7d', 'seasonal')),
        CONSTRAINT ck_flood_predictions_risk_level CHECK (risk_level IN ('normal', 'watch', 'warning', 'severe')),
        CONSTRAINT ck_flood_predictions_score CHECK (likelihood_score BETWEEN 0 AND 100),
        CONSTRAINT ck_flood_predictions_data_type CHECK (data_type IN ('OBSERVED', 'DERIVED', 'MODELLED', 'ESTIMATED', 'SYNTHETIC')),
        CONSTRAINT fk_flood_predictions_admin_unit FOREIGN KEY (admin_unit_id) REFERENCES admin_units (id) ON DELETE CASCADE,
        CONSTRAINT fk_flood_predictions_country FOREIGN KEY (country_code) REFERENCES countries (country_code) ON UPDATE CASCADE ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_flood_predictions_country_horizon ON flood_predictions (country_code, horizon, likelihood_score DESC)`,
    );

    await queryRunner.query(`
      CREATE TABLE platform_settings (
        id                        smallint     PRIMARY KEY DEFAULT 1,
        show_public_flood_outlook boolean      NOT NULL DEFAULT false,
        public_outlook_horizon    varchar(12)  NOT NULL DEFAULT '7d',
        updated_by                uuid,
        updated_at                timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT ck_platform_settings_singleton CHECK (id = 1),
        CONSTRAINT ck_platform_settings_horizon CHECK (public_outlook_horizon IN ('7d', 'seasonal')),
        CONSTRAINT fk_platform_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      INSERT INTO platform_settings (id, show_public_flood_outlook, public_outlook_horizon)
      VALUES (1, false, '7d')
      ON CONFLICT (id) DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE platform_settings`);
    await queryRunner.query(`DROP TABLE flood_predictions`);
    await queryRunner.query(`DROP TABLE ai_usage_logs`);
    await queryRunner.query(`DROP TABLE ai_credentials`);
  }
}
