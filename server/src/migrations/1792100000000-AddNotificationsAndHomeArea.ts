import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Notifications, and each user's home area.
 *
 * users.home_admin_unit_id: the LGA a person lives or works in. Part of a complete profile (with
 * their name and phone number), and what decides which flood alerts reach them.
 *
 * notifications: the in-app inbox. One row per person per event; read_at is set when they open it.
 *
 * notification_preferences: which channels (in-app, email, push) each person wants for each
 * category. No row means everything is on: every person starts with every channel active.
 *
 * push_tokens: Firebase Cloud Messaging tokens, one per browser or installed app a person has
 * allowed notifications on. Tokens FCM reports as no longer valid are deleted when sending.
 *
 * email_outbox: emails waiting to go out (common/email/email-outbox.ts).
 */
export class AddNotificationsAndHomeArea1792100000000 implements MigrationInterface {
  name = "AddNotificationsAndHomeArea1792100000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN home_admin_unit_id uuid,
        ADD CONSTRAINT fk_users_home_admin_unit FOREIGN KEY (home_admin_unit_id) REFERENCES admin_units (id) ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE notifications (
        id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid          NOT NULL,
        category    varchar(20)   NOT NULL,
        title       varchar(200)  NOT NULL,
        body        varchar(1000) NOT NULL,
        link        varchar(500),
        read_at     timestamptz,
        created_at  timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT ck_notifications_category CHECK (category IN ('flood_alerts', 'my_reports', 'review_queue', 'account')),
        CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_notifications_user_unread ON notifications (user_id) WHERE read_at IS NULL`);

    await queryRunner.query(`
      CREATE TABLE notification_preferences (
        user_id     uuid         NOT NULL,
        category    varchar(20)  NOT NULL,
        in_app      boolean      NOT NULL DEFAULT true,
        email       boolean      NOT NULL DEFAULT true,
        push        boolean      NOT NULL DEFAULT true,
        updated_at  timestamptz  NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, category),
        CONSTRAINT ck_notification_preferences_category CHECK (category IN ('flood_alerts', 'my_reports', 'review_queue', 'account')),
        CONSTRAINT fk_notification_preferences_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE push_tokens (
        id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       uuid          NOT NULL,
        token         varchar(4096) NOT NULL,
        user_agent    varchar(300),
        created_at    timestamptz   NOT NULL DEFAULT now(),
        last_seen_at  timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT uq_push_tokens_token UNIQUE (token),
        CONSTRAINT fk_push_tokens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_push_tokens_user ON push_tokens (user_id)`);

    // Emails wait here and a worker sends a few at a time (EMAIL_MAX_PER_TICK), retrying failures
    // with growing gaps, so a busy alert never hits a provider's limits or slows a request down.
    await queryRunner.query(`
      CREATE TABLE email_outbox (
        id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        to_address       varchar(320)  NOT NULL,
        subject          varchar(300)  NOT NULL,
        text_body        text          NOT NULL,
        html_body        text          NOT NULL,
        status           varchar(10)   NOT NULL DEFAULT 'pending',
        attempts         smallint      NOT NULL DEFAULT 0,
        last_error       varchar(1000),
        next_attempt_at  timestamptz   NOT NULL DEFAULT now(),
        created_at       timestamptz   NOT NULL DEFAULT now(),
        sent_at          timestamptz,
        CONSTRAINT ck_email_outbox_status CHECK (status IN ('pending', 'sent', 'failed'))
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_email_outbox_due ON email_outbox (next_attempt_at) WHERE status = 'pending'`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE email_outbox`);
    await queryRunner.query(`DROP TABLE push_tokens`);
    await queryRunner.query(`DROP TABLE notification_preferences`);
    await queryRunner.query(`DROP TABLE notifications`);
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT fk_users_home_admin_unit, DROP COLUMN home_admin_unit_id`);
  }
}
