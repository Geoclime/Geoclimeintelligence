/**
 * The one contract every AI vendor sits behind (docs/ai-integration.md). Feature code never
 * imports a vendor SDK: it calls AiService, which calls an AiProvider. Adding a vendor means one
 * adapter file and one line in providers.ts.
 */
export const AI_PROVIDERS = ["anthropic", "openai", "gemini", "ollama"] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number];

export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Google Gemini",
  ollama: "Ollama",
};

export interface AiImage {
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  /** Base64, no data: prefix. */
  data: string;
}

export interface AiGenerateRequest {
  model: string;
  /** Defaults to env.AI_REQUEST_TIMEOUT_MS. */
  timeoutMs?: number;
  /** Ollama only: the server to call (already passed through checkServerAddress). */
  baseUrl?: string;
  system: string;
  prompt: string;
  /** A model that can't see images must refuse with kind "invalid_request". */
  images?: AiImage[];
  schemaName: string;
  /** Every property listed in `required`, and additionalProperties: false. */
  jsonSchema: Record<string, unknown>;
  maxOutputTokens: number;
}

export interface AiGenerateResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  model: string;
  baseUrl?: string;
  system: string;
  messages: AiChatMessage[];
  maxOutputTokens: number;
}

export interface AiModelInfo {
  id: string;
  label: string;
  /** Cosmetic only (model-tiers.ts): advice in the settings UI, never a decision. */
  tier?: "capable" | "balanced" | "fast" | null;
}

export interface AiProvider {
  readonly id: AiProviderId;
  /** Structured output: the reply text should be one JSON object matching jsonSchema. */
  generate(apiKey: string, request: AiGenerateRequest): Promise<AiGenerateResult>;
  /** Streamed chat text; onText receives each delta. Resolves with the full text and usage. */
  stream(apiKey: string, request: AiChatRequest, onText: (delta: string) => void): Promise<AiGenerateResult>;
  /** Text-chat models only. Doubles as the API-key check, so a bad key MUST fail with kind "auth". */
  listModels(apiKey: string, baseUrl?: string): Promise<AiModelInfo[]>;
}

export type AiErrorKind = "auth" | "account" | "rate_limit" | "invalid_request" | "refused" | "truncated" | "unavailable";

/**
 * 402, or wording that means plan, quota or balance. Adapters check this FIRST, because
 * providers use 400/402/403/429 for it inconsistently.
 */
export function isAccountProblem(status: number | undefined, message: string): boolean {
  return (
    status === 402 ||
    /subscri|upgrade your|quota|billing|credit balance|insufficient (balance|credit|fund)|payment required|paid plan|free tier/i.test(
      message,
    )
  );
}

/** Every vendor error is normalised to one of these. `detail` is for logs only, never a client. */
export class AiProviderError extends Error {
  constructor(
    public readonly kind: AiErrorKind,
    public readonly detail: string,
    public readonly status?: number,
  ) {
    super(`AI provider error (${kind}): ${detail}`);
    this.name = new.target.name;
  }
}

/** Placeholder for adapters whose SDK isn't wired in yet: behaves like an unreachable provider. */
export function notConnected(id: AiProviderId): Promise<never> {
  return Promise.reject(new AiProviderError("unavailable", `The ${id} adapter is not connected yet`));
}
