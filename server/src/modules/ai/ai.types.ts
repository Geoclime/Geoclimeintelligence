import type { z } from "zod";
import type { AiFeature } from "./domain/ai-features";
import type { AiChatMessage, AiImage, AiProviderId } from "./providers/ai-provider";

/** Whose key paid for a request: the person's own, or the platform default an admin set. */
export type AiKeySource = "user" | "platform";

/** The key and model a request will use, decrypted. Never leaves the server. */
export interface ResolvedCredential {
  apiKey: string;
  provider: AiProviderId;
  model: string;
  /** A cheaper model for chat. Ignored when a feature has its own pinned model. */
  chatModel: string | null;
  baseUrl: string | null;
  source: AiKeySource;
}

/**
 * Picks the key for a request: the user's own (feature-pinned, then active), then the platform's
 * (same order). Phase 1 builds AiCredentialService on an `ai_credentials` table to do this.
 */
export interface IAiCredentialResolver {
  resolveFor(userId: string, feature?: AiFeature): Promise<ResolvedCredential | null>;
}

/** One `ai_usage_logs` row: counts only, never the prompt or the reply. */
export interface NewAiUsage {
  userId: string;
  keySource: AiKeySource;
  provider: AiProviderId;
  model: string;
  feature: AiFeature;
  inputTokens: number;
  outputTokens: number;
  status: "ok" | "error";
  errorKind: string | null;
  durationMs: number;
}

export interface IAiUsageRecorder {
  record(entry: NewAiUsage): Promise<void>;
}

export interface GenerateJsonRequest<T> {
  feature: AiFeature;
  system: string;
  prompt: string;
  images?: AiImage[];
  schema: z.ZodType<T>;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  /** Default 16000. */
  maxOutputTokens?: number;
  timeoutMs?: number;
  /** A friendlier message when the validation reason includes `includes`. */
  rejectionHints?: { includes: string; message: string }[];
}

export interface GenerateJsonResult<T> {
  data: T;
  /** The model couldn't see images, so the request was re-sent without them. */
  imagesIgnored: boolean;
  provider: AiProviderId;
  model: string;
  source: AiKeySource;
}

export interface StreamTextRequest {
  feature: AiFeature;
  system: string;
  messages: AiChatMessage[];
  /** Default 8000. */
  maxOutputTokens?: number;
}

/** GET /api/v1/ai/status (Phase 1). Mirrored by AiStatus in client/src/types/ai.types.ts. */
export interface AiStatusDto {
  available: boolean;
  source: AiKeySource | null;
  provider: AiProviderId | null;
  providerLabel: string | null;
  model: string | null;
  /** false when AI_KEYS_SECRET is unset, so no key can be saved. */
  storageReady: boolean;
}
