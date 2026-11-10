import { AppDataSource } from "../../../config/data-source";
import type { AiChatMessage } from "../providers/ai-provider";
import type { AiConversationDto, AiConversationSummaryDto, IAiConversationRepository, NewExchange } from "./assistant.types";

type Stamp = Date | string;
const iso = (value: Stamp) => (value instanceof Date ? value : new Date(value)).toISOString();

/** The assistant's chat history: ai_conversations and ai_conversation_messages, always filtered by owner. */
export class AiConversationRepository implements IAiConversationRepository {
  private static _instance?: AiConversationRepository;
  static get Instance(): AiConversationRepository {
    return (this._instance ??= new AiConversationRepository());
  }

  async list(userId: string, limit: number): Promise<AiConversationSummaryDto[]> {
    const rows: { id: string; title: string; messageCount: number; createdAt: Stamp; updatedAt: Stamp }[] = await AppDataSource.query(
      `SELECT c.id, c.title, c.created_at AS "createdAt", c.updated_at AS "updatedAt",
              (SELECT count(*)::int FROM ai_conversation_messages m WHERE m.conversation_id = c.id) AS "messageCount"
         FROM ai_conversations c
        WHERE c.user_id = $1
        ORDER BY c.updated_at DESC
        LIMIT $2`,
      [userId, limit],
    );
    return rows.map((row) => ({ ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) }));
  }

  async find(userId: string, id: string) {
    const rows: { id: string; title: string; messageCount: number; createdAt: Stamp; updatedAt: Stamp }[] = await AppDataSource.query(
      `SELECT c.id, c.title, c.created_at AS "createdAt", c.updated_at AS "updatedAt",
              (SELECT count(*)::int FROM ai_conversation_messages m WHERE m.conversation_id = c.id) AS "messageCount"
         FROM ai_conversations c
        WHERE c.id = $1 AND c.user_id = $2`,
      [id, userId],
    );
    const row = rows[0];
    return row ? { ...row, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) } : null;
  }

  async messages(conversationId: string): Promise<AiConversationDto["messages"]> {
    const rows: { role: AiChatMessage["role"]; content: string; createdAt: Stamp }[] = await AppDataSource.query(
      `SELECT role, content, created_at AS "createdAt" FROM ai_conversation_messages WHERE conversation_id = $1 ORDER BY id`,
      [conversationId],
    );
    return rows.map((row) => ({ ...row, createdAt: iso(row.createdAt) }));
  }

  async recentMessages(conversationId: string, count: number): Promise<AiChatMessage[]> {
    const rows: AiChatMessage[] = await AppDataSource.query(
      `SELECT role, content FROM (
         SELECT id, role, content FROM ai_conversation_messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT $2
       ) recent ORDER BY id`,
      [conversationId, count],
    );
    return rows;
  }

  async appendExchange(exchange: NewExchange): Promise<{ id: string; title: string }> {
    return AppDataSource.transaction(async (manager) => {
      let conversation: { id: string; title: string } | undefined;
      if (exchange.conversationId) {
        const touched: { id: string; title: string }[] = await manager.query(
          `UPDATE ai_conversations SET updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING id, title`,
          [exchange.conversationId, exchange.userId],
        );
        conversation = touched[0];
      }
      // A chat deleted (on another device) while its answer was on the way starts again as a new one.
      if (!conversation) {
        const created: { id: string; title: string }[] = await manager.query(
          `INSERT INTO ai_conversations (user_id, title) VALUES ($1, $2) RETURNING id, title`,
          [exchange.userId, exchange.title],
        );
        conversation = created[0]!;
      }
      await manager.query(
        `INSERT INTO ai_conversation_messages (conversation_id, role, content) VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
        [conversation.id, exchange.question, exchange.answer],
      );
      return conversation;
    });
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const [row]: { n: number }[] = await AppDataSource.query(
      `WITH gone AS (DELETE FROM ai_conversations WHERE id = $1 AND user_id = $2 RETURNING 1) SELECT count(*)::int AS n FROM gone`,
      [id, userId],
    );
    return (row?.n ?? 0) > 0;
  }

  async removeAll(userId: string): Promise<number> {
    const [row]: { n: number }[] = await AppDataSource.query(
      `WITH gone AS (DELETE FROM ai_conversations WHERE user_id = $1 RETURNING 1) SELECT count(*)::int AS n FROM gone`,
      [userId],
    );
    return row?.n ?? 0;
  }
}
