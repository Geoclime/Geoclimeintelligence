import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * The AI assistant's chat history (docs/ai-assistant.md). Each person's past chats, so they can reopen one
 * on any device, carry on, or delete it.
 *
 *  - `ai_conversations`: one row per chat, owned by one user. Only its owner ever reads it; deleting the
 *    account deletes their chats.
 *  - `ai_conversation_messages`: the turns, in order (`id` is an identity column, so it orders them).
 *    A question and its answer are saved together after the answer arrives, so a chat always takes turns.
 *
 * The usage log (`ai_usage_logs`) still holds counts only.
 */
export class CreateAiConversations1793900000000 implements MigrationInterface {
  name = "CreateAiConversations1793900000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE ai_conversations (
        id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid          NOT NULL,
        title       varchar(120)  NOT NULL,
        created_at  timestamptz   NOT NULL DEFAULT now(),
        updated_at  timestamptz   NOT NULL DEFAULT now(),
        CONSTRAINT fk_ai_conversations_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_ai_conversations_user_updated ON ai_conversations (user_id, updated_at DESC)`);

    await queryRunner.query(`
      CREATE TABLE ai_conversation_messages (
        id               bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        conversation_id  uuid         NOT NULL,
        role             varchar(10)  NOT NULL,
        content          text         NOT NULL,
        created_at       timestamptz  NOT NULL DEFAULT now(),
        CONSTRAINT ck_ai_conversation_messages_role CHECK (role IN ('user', 'assistant')),
        CONSTRAINT ck_ai_conversation_messages_length CHECK (char_length(content) BETWEEN 1 AND 20000),
        CONSTRAINT fk_ai_conversation_messages_conversation FOREIGN KEY (conversation_id) REFERENCES ai_conversations (id) ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_ai_conversation_messages_conversation ON ai_conversation_messages (conversation_id, id)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE ai_conversation_messages`);
    await queryRunner.query(`DROP TABLE ai_conversations`);
  }
}
