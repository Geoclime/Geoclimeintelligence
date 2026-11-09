import { AppDataSource } from "../../config/data-source";
import type {
  AiCredentialRecord,
  IAiCredentialRepository,
  IAiUsageRecorder,
  NewAiUsage,
} from "./ai.types";
import type { AiProviderId } from "./providers/ai-provider";

interface RawCredentialRow {
  id: string;
  user_id: string | null;
  provider: AiProviderId;
  model: string;
  chat_model: string | null;
  feature_models: Record<string, string> | null;
  base_url: string | null;
  key_ciphertext: string;
  key_last4: string;
  is_active: boolean;
  updated_by: string;
  updated_at: Date | string;
}

function toRecord(row: RawCredentialRow): AiCredentialRecord {
  return {
    id: row.id,
    userId: row.user_id,
    provider: row.provider,
    model: row.model,
    chatModel: row.chat_model,
    featureModels: row.feature_models ?? {},
    baseUrl: row.base_url,
    keyCiphertext: row.key_ciphertext,
    keyLast4: row.key_last4,
    isActive: Boolean(row.is_active),
    updatedBy: row.updated_by,
    updatedAt: row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at),
  };
}

export class AiRepository implements IAiCredentialRepository, IAiUsageRecorder {
  private static _instance?: AiRepository;
  static get Instance(): AiRepository {
    return (this._instance ??= new AiRepository());
  }

  async findByOwner(userId: string | null): Promise<AiCredentialRecord[]> {
    const rows: RawCredentialRow[] =
      userId === null
        ? await AppDataSource.query(
            `SELECT * FROM ai_credentials WHERE user_id IS NULL ORDER BY is_active DESC, provider ASC`,
          )
        : await AppDataSource.query(
            `SELECT * FROM ai_credentials WHERE user_id = $1 ORDER BY is_active DESC, provider ASC`,
            [userId],
          );
    return rows.map(toRecord);
  }

  async findByOwnerAndProvider(userId: string | null, provider: AiProviderId): Promise<AiCredentialRecord | null> {
    const rows: RawCredentialRow[] =
      userId === null
        ? await AppDataSource.query(`SELECT * FROM ai_credentials WHERE user_id IS NULL AND provider = $1 LIMIT 1`, [provider])
        : await AppDataSource.query(`SELECT * FROM ai_credentials WHERE user_id = $1 AND provider = $2 LIMIT 1`, [userId, provider]);
    return rows[0] ? toRecord(rows[0]) : null;
  }

  async upsert(input: {
    userId: string | null;
    provider: AiProviderId;
    model: string;
    chatModel: string | null;
    baseUrl: string | null;
    keyCiphertext: string;
    keyLast4: string;
    isActive: boolean;
    updatedBy: string;
  }): Promise<AiCredentialRecord> {
    return AppDataSource.transaction(async (manager) => {
      if (input.isActive) {
        if (input.userId === null) {
          await manager.query(`UPDATE ai_credentials SET is_active = false WHERE user_id IS NULL AND provider <> $1`, [input.provider]);
        } else {
          await manager.query(`UPDATE ai_credentials SET is_active = false WHERE user_id = $1 AND provider <> $2`, [
            input.userId,
            input.provider,
          ]);
        }
      }

      const existing = await this.findByOwnerAndProviderIn(manager, input.userId, input.provider);
      if (existing) {
        // An UPDATE run through TypeORM's query() comes back as [rows, rowCount], not as the rows, so it
        // is wrapped in a CTE and read back with a SELECT, as the other repositories do (INSERT is fine).
        const rows: RawCredentialRow[] = await manager.query(
          `WITH changed AS (
             UPDATE ai_credentials
                SET model = $2,
                    chat_model = $3,
                    base_url = $4,
                    key_ciphertext = $5,
                    key_last4 = $6,
                    is_active = $7,
                    updated_by = $8,
                    updated_at = now()
              WHERE id = $1
              RETURNING *)
           SELECT * FROM changed`,
          [
            existing.id,
            input.model,
            input.chatModel,
            input.baseUrl,
            input.keyCiphertext,
            input.keyLast4,
            input.isActive,
            input.updatedBy,
          ],
        );
        return toRecord(rows[0]!);
      }

      const rows: RawCredentialRow[] = await manager.query(
        `INSERT INTO ai_credentials (
           user_id, provider, model, chat_model, feature_models, base_url, key_ciphertext, key_last4, is_active, updated_by
         ) VALUES ($1, $2, $3, $4, '{}'::jsonb, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          input.userId,
          input.provider,
          input.model,
          input.chatModel,
          input.baseUrl,
          input.keyCiphertext,
          input.keyLast4,
          input.isActive,
          input.updatedBy,
        ],
      );
      return toRecord(rows[0]!);
    });
  }

  async activate(userId: string | null, provider: AiProviderId, updatedBy: string): Promise<boolean> {
    return AppDataSource.transaction(async (manager) => {
      const target = await this.findByOwnerAndProviderIn(manager, userId, provider);
      if (!target) return false;
      if (userId === null) {
        await manager.query(`UPDATE ai_credentials SET is_active = false WHERE user_id IS NULL`);
      } else {
        await manager.query(`UPDATE ai_credentials SET is_active = false WHERE user_id = $1`, [userId]);
      }
      await manager.query(`UPDATE ai_credentials SET is_active = true, updated_by = $2, updated_at = now() WHERE id = $1`, [
        target.id,
        updatedBy,
      ]);
      return true;
    });
  }

  async remove(userId: string | null, provider: AiProviderId): Promise<boolean> {
    const rows: { n: number }[] =
      userId === null
        ? await AppDataSource.query(
            `WITH gone AS (DELETE FROM ai_credentials WHERE user_id IS NULL AND provider = $1 RETURNING id)
             SELECT count(*)::int AS n FROM gone`,
            [provider],
          )
        : await AppDataSource.query(
            `WITH gone AS (DELETE FROM ai_credentials WHERE user_id = $1 AND provider = $2 RETURNING id)
             SELECT count(*)::int AS n FROM gone`,
            [userId, provider],
          );
    return (rows[0]?.n ?? 0) > 0;
  }

  async record(entry: NewAiUsage): Promise<void> {
    await AppDataSource.query(
      `INSERT INTO ai_usage_logs (
         user_id, key_source, provider, model, feature, input_tokens, output_tokens, status, error_kind, duration_ms
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.userId,
        entry.keySource,
        entry.provider,
        entry.model,
        entry.feature,
        entry.inputTokens,
        entry.outputTokens,
        entry.status,
        entry.errorKind,
        entry.durationMs,
      ],
    );
  }

  private async findByOwnerAndProviderIn(
    manager: { query: (sql: string, params?: unknown[]) => Promise<RawCredentialRow[]> },
    userId: string | null,
    provider: AiProviderId,
  ): Promise<AiCredentialRecord | null> {
    const rows =
      userId === null
        ? await manager.query(`SELECT * FROM ai_credentials WHERE user_id IS NULL AND provider = $1 LIMIT 1`, [provider])
        : await manager.query(`SELECT * FROM ai_credentials WHERE user_id = $1 AND provider = $2 LIMIT 1`, [userId, provider]);
    return rows[0] ? toRecord(rows[0]) : null;
  }
}
