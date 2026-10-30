import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Role requests. Nobody chooses their own role: every account starts as general_public. A user
 * may ask for a staff role (responder, official or researcher) with a reason, and an
 * administrator approves it (by giving that role) or declines it. One open request per user,
 * held on the users row:
 *
 * - `requested_role` is never administrator or general_public (the CHECK), so the platform's top
 *   role can only ever be given, never asked for;
 * - the request's three columns are set and cleared together (the second CHECK);
 * - a partial index serves the administrator's "open requests" filter.
 */
export class AddRoleRequests1791800000000 implements MigrationInterface {
  name = "AddRoleRequests1791800000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users
        ADD COLUMN requested_role      varchar(32),
        ADD COLUMN role_request_reason varchar(500),
        ADD COLUMN role_requested_at   timestamptz,
        ADD CONSTRAINT ck_users_requested_role
          CHECK (requested_role IN ('emergency_responder', 'government_official', 'researcher')),
        ADD CONSTRAINT ck_users_role_request_complete
          CHECK ((requested_role IS NULL) = (role_requested_at IS NULL)
             AND (requested_role IS NULL) = (role_request_reason IS NULL))
    `);
    await queryRunner.query(`CREATE INDEX idx_users_role_requested_at ON users (role_requested_at) WHERE requested_role IS NOT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX idx_users_role_requested_at`);
    await queryRunner.query(`
      ALTER TABLE users
        DROP CONSTRAINT ck_users_role_request_complete,
        DROP CONSTRAINT ck_users_requested_role,
        DROP COLUMN role_requested_at,
        DROP COLUMN role_request_reason,
        DROP COLUMN requested_role
    `);
  }
}
