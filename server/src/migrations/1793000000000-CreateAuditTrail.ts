import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Who did what, kept for good (docs/audit-and-permissions.md).
 *
 *  - `audit_events`: one row per action that changes the record of the ground (a flood or drain
 *    recorded, inspected, receded or deleted; a place saved, edited or deleted; a photo added or
 *    removed; a role or a permission changed). Each row keeps a copy of who did it (name, email, role
 *    at the time), so it still reads after the account is gone. It is APPEND-ONLY: a trigger refuses
 *    every UPDATE and DELETE, except the one the database itself makes when an account is deleted
 *    (`actor_id` set to null, nothing else touched).
 *  - `drain_inspections`: every "I checked it" on a drain, with the condition before and after, who
 *    checked and their role, and, when the phone shared it, where they stood and how far that was from
 *    the drain. Written in the same statement that changes the drain, so an inspection can't happen
 *    without its record.
 *  - `drainage_features.last_checked_by` and `flood_extents.receded_by` / `reopened_by`: who last
 *    looked at a drain, and who called a flood over (or not over), for the popups. Staff-only to read.
 */
export class CreateAuditTrail1793000000000 implements MigrationInterface {
  name = "CreateAuditTrail1793000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE audit_events (
        id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
        occurred_at  timestamptz  NOT NULL DEFAULT now(),
        actor_id     uuid,
        actor_name   varchar(200),
        actor_email  varchar(320),
        actor_role   varchar(32)  NOT NULL,
        action       varchar(48)  NOT NULL,
        entity_type  varchar(32)  NOT NULL,
        entity_id    uuid,
        lga_id       uuid,
        ward_id      uuid,
        summary      varchar(300) NOT NULL,
        details      jsonb        NOT NULL DEFAULT '{}'::jsonb,
        CONSTRAINT fk_audit_events_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_audit_events_time ON audit_events (occurred_at DESC, id DESC)`);
    await queryRunner.query(`CREATE INDEX idx_audit_events_actor ON audit_events (actor_id, occurred_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_audit_events_entity ON audit_events (entity_type, entity_id)`);
    await queryRunner.query(`CREATE INDEX idx_audit_events_action ON audit_events (action, occurred_at DESC)`);

    await queryRunner.query(`
      CREATE FUNCTION audit_events_append_only() RETURNS trigger AS $$
      BEGIN
        -- The one change allowed: an account was deleted, so the foreign key empties actor_id. The copy
        -- of the person's name, email and role stays, which is why it was kept.
        IF TG_OP = 'UPDATE' AND NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
           AND (to_jsonb(NEW) - 'actor_id') = (to_jsonb(OLD) - 'actor_id') THEN
          RETURN NEW;
        END IF;
        RAISE EXCEPTION 'audit_events is append-only: % is not allowed', TG_OP;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_audit_events_append_only
        BEFORE UPDATE OR DELETE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION audit_events_append_only()
    `);

    await queryRunner.query(`
      CREATE TABLE drain_inspections (
        id                   uuid             PRIMARY KEY DEFAULT gen_random_uuid(),
        drain_id             uuid             NOT NULL,
        inspected_at         timestamptz      NOT NULL DEFAULT now(),
        inspected_by         uuid,
        inspector_name       varchar(200),
        inspector_role       varchar(32)      NOT NULL,
        condition_before     varchar(14)      NOT NULL,
        condition_after      varchar(14)      NOT NULL,
        note                 varchar(500),
        inspector_point      geometry(Point, 4326),
        inspector_accuracy_m double precision,
        distance_m           double precision,
        CONSTRAINT fk_drain_inspections_drain FOREIGN KEY (drain_id) REFERENCES drainage_features (id) ON DELETE CASCADE,
        CONSTRAINT fk_drain_inspections_by FOREIGN KEY (inspected_by) REFERENCES users (id) ON DELETE SET NULL,
        CONSTRAINT ck_drain_inspections_condition CHECK (
          condition_before IN ('clear', 'partly_blocked', 'blocked', 'overflowing', 'damaged')
          AND condition_after IN ('clear', 'partly_blocked', 'blocked', 'overflowing', 'damaged')
        ),
        CONSTRAINT ck_drain_inspections_accuracy CHECK (inspector_accuracy_m IS NULL OR inspector_accuracy_m >= 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_drain_inspections_drain ON drain_inspections (drain_id, inspected_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_drain_inspections_by ON drain_inspections (inspected_by, inspected_at DESC)`);

    await queryRunner.query(`
      ALTER TABLE drainage_features
        ADD COLUMN last_checked_by uuid,
        ADD CONSTRAINT fk_drainage_last_checked_by FOREIGN KEY (last_checked_by) REFERENCES users (id) ON DELETE SET NULL
    `);
    // A drain's first check is its recording: whoever recorded it checked it last until someone else does.
    await queryRunner.query(`UPDATE drainage_features SET last_checked_by = recorded_by WHERE last_checked_by IS NULL`);

    await queryRunner.query(`
      ALTER TABLE flood_extents
        ADD COLUMN receded_by uuid,
        ADD COLUMN reopened_by uuid,
        ADD COLUMN reopened_at timestamptz,
        ADD CONSTRAINT fk_flood_extents_receded_by FOREIGN KEY (receded_by) REFERENCES users (id) ON DELETE SET NULL,
        ADD CONSTRAINT fk_flood_extents_reopened_by FOREIGN KEY (reopened_by) REFERENCES users (id) ON DELETE SET NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE flood_extents
        DROP CONSTRAINT fk_flood_extents_reopened_by,
        DROP CONSTRAINT fk_flood_extents_receded_by,
        DROP COLUMN reopened_at,
        DROP COLUMN reopened_by,
        DROP COLUMN receded_by
    `);
    await queryRunner.query(`ALTER TABLE drainage_features DROP CONSTRAINT fk_drainage_last_checked_by, DROP COLUMN last_checked_by`);
    await queryRunner.query(`DROP TABLE drain_inspections`);
    await queryRunner.query(`DROP TABLE audit_events`);
    await queryRunner.query(`DROP FUNCTION audit_events_append_only()`);
  }
}
