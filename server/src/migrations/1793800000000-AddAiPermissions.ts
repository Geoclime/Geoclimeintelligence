import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * AI becomes two permissions on the Roles screen (docs/ai-assistant.md), instead of a role list in code:
 *
 *  - `ai.use`: the AI assistant chat, AI flood outlooks, and AI alert drafts (an alert draft also needs
 *    `alerts.issue`).
 *  - `ai.own_keys`: save a personal AI provider key.
 *
 * Seeded to the roles that could already use AI (responders, officials and researchers), so nobody's
 * access changes. The general public gets neither: every request they made would be paid for by the
 * platform's key, so an administrator decides that on the Roles screen.
 */
export class AddAiPermissions1793800000000 implements MigrationInterface {
  name = "AddAiPermissions1793800000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO role_permissions (role_code, permission)
      SELECT r.code, p.permission
        FROM roles r
       CROSS JOIN (VALUES ('ai.use'), ('ai.own_keys')) AS p (permission)
       WHERE r.code IN ('emergency_responder', 'government_official', 'researcher')
      ON CONFLICT DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM role_permissions WHERE permission IN ('ai.use', 'ai.own_keys')`);
  }
}
