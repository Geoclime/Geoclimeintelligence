import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Flood alerts and community flood reports.
 *
 * flood_alerts: an official warning for one or more areas (flood_alert_areas: LGAs or states).
 * - severity is watch < warning < severe; an alert is active between starts_at and expires_at
 *   unless ended early (ended_at);
 * - issued by a government official or an administrator (checked by the API, with region scope).
 *
 * flood_reports: what someone saw on the ground, with a GPS point and the water depth.
 * - every report starts 'pending' and is public only once a responder, official or administrator
 *   has published it; rejected reports are kept for the record;
 * - lga_id / ward_id are found by point-in-polygon when the report arrives (null outside every
 *   mapped area), and are what region scope filters on;
 * - reporter_id is SET NULL when the account is deleted: the report (a public-interest record)
 *   outlives the account without keeping a link to the person.
 *
 * flood_report_media: photos and voice notes, stored in the database with a hard size cap
 * (photos are shrunk in the browser first). Video needs file storage and is not accepted yet.
 */
export class CreateFloodAlertsAndReports1791900000000 implements MigrationInterface {
  name = "CreateFloodAlertsAndReports1791900000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE flood_alerts (
        id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        severity    varchar(12)   NOT NULL,
        title       varchar(160)  NOT NULL,
        message     text          NOT NULL,
        actions     text          NOT NULL DEFAULT '',
        starts_at   timestamptz   NOT NULL DEFAULT now(),
        expires_at  timestamptz   NOT NULL,
        ended_at    timestamptz,
        created_by  uuid,
        created_at  timestamptz   NOT NULL DEFAULT now(),
        updated_at  timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT ck_flood_alerts_severity CHECK (severity IN ('watch', 'warning', 'severe')),
        CONSTRAINT ck_flood_alerts_window CHECK (expires_at > starts_at),
        CONSTRAINT ck_flood_alerts_message CHECK (char_length(message) BETWEEN 1 AND 2000 AND char_length(actions) <= 2000),
        CONSTRAINT fk_flood_alerts_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_flood_alerts_window ON flood_alerts (expires_at, starts_at) WHERE ended_at IS NULL`);

    await queryRunner.query(`
      CREATE TABLE flood_alert_areas (
        alert_id       uuid NOT NULL,
        admin_unit_id  uuid NOT NULL,
        PRIMARY KEY (alert_id, admin_unit_id),
        CONSTRAINT fk_flood_alert_areas_alert FOREIGN KEY (alert_id) REFERENCES flood_alerts (id) ON DELETE CASCADE,
        CONSTRAINT fk_flood_alert_areas_unit FOREIGN KEY (admin_unit_id) REFERENCES admin_units (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_flood_alert_areas_unit ON flood_alert_areas (admin_unit_id)`);

    await queryRunner.query(`
      CREATE TABLE flood_reports (
        id             uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_id    uuid,
        geom           geometry(Point, 4326)  NOT NULL,
        location_name  varchar(200)           NOT NULL,
        lga_id         uuid,
        ward_id        uuid,
        water_depth    varchar(12)            NOT NULL,
        description    text                   NOT NULL,
        status         varchar(10)            NOT NULL DEFAULT 'pending',
        review_note    varchar(500),
        reviewed_by    uuid,
        reviewed_at    timestamptz,
        created_at     timestamptz            NOT NULL DEFAULT now(),
        updated_at     timestamptz            NOT NULL DEFAULT now(),
        CONSTRAINT ck_flood_reports_depth CHECK (water_depth IN ('ankle', 'knee', 'waist', 'chest', 'impassable')),
        CONSTRAINT ck_flood_reports_status CHECK (status IN ('pending', 'published', 'rejected')),
        CONSTRAINT ck_flood_reports_description CHECK (char_length(description) BETWEEN 10 AND 2000),
        CONSTRAINT ck_flood_reports_reviewed CHECK ((status = 'pending') = (reviewed_at IS NULL)),
        CONSTRAINT fk_flood_reports_reporter FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT fk_flood_reports_reviewer FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT fk_flood_reports_lga FOREIGN KEY (lga_id) REFERENCES admin_units (id) ON DELETE SET NULL,
        CONSTRAINT fk_flood_reports_ward FOREIGN KEY (ward_id) REFERENCES admin_units (id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_flood_reports_geom ON flood_reports USING gist (geom)`);
    await queryRunner.query(`CREATE INDEX idx_flood_reports_status_created ON flood_reports (status, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_flood_reports_reporter ON flood_reports (reporter_id, created_at DESC)`);

    await queryRunner.query(`
      CREATE TABLE flood_report_media (
        id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        report_id   uuid          NOT NULL,
        kind        varchar(8)    NOT NULL,
        mime_type   varchar(80)   NOT NULL,
        byte_size   integer       NOT NULL,
        data        bytea         NOT NULL,
        created_at  timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT ck_flood_report_media_kind CHECK (kind IN ('photo', 'audio')),
        CONSTRAINT ck_flood_report_media_size CHECK (byte_size BETWEEN 1 AND 3145728),
        CONSTRAINT fk_flood_report_media_report FOREIGN KEY (report_id) REFERENCES flood_reports (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_flood_report_media_report ON flood_report_media (report_id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE flood_report_media`);
    await queryRunner.query(`DROP TABLE flood_reports`);
    await queryRunner.query(`DROP TABLE flood_alert_areas`);
    await queryRunner.query(`DROP TABLE flood_alerts`);
  }
}
