import { env } from "../../../config/env";
import {
  AiProviderError,
  isAccountProblem,
  type AiChatRequest,
  type AiGenerateRequest,
  type AiGenerateResult,
  type AiModelInfo,
  type AiProvider,
} from "./ai-provider";
import { modelTier } from "./model-tiers";

const API_BASE = "https://api.anthropic.com/v1";
const ANTHROPIC_VERSION = "2023-06-01";

interface AnthropicMessageResponse {
  content?: { type?: string; text?: string }[];
  stop_reason?: string;
  usage?: {
    input_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
    output_tokens?: number;
  };
  error?: { message?: string };
}

function normaliseError(status: number | undefined, message: string): AiProviderError {
  if (isAccountProblem(status, message)) return new AiProviderError("account", message, status);
  if (status === 401 || status === 403) return new AiProviderError("auth", message, status);
  if (status === 429) return new AiProviderError("rate_limit", message, status);
  if (status !== undefined && status >= 400 && status < 500) {
    return new AiProviderError("invalid_request", message, status);
  }
  return new AiProviderError("unavailable", message || "Anthropic could not be reached", status);
}

/**
 * Anthropic adapter via the v1 Messages REST API.
 */
export const anthropicProvider: AiProvider = {
  id: "anthropic",

  async generate(apiKey: string, req: AiGenerateRequest): Promise<AiGenerateResult> {
    if (!apiKey || apiKey.trim().length < 10) {
      throw new AiProviderError("auth", "API key is too short", 401);
    }
    const timeoutMs = req.timeoutMs ?? env.AI_REQUEST_TIMEOUT_MS;
    const content: Record<string, unknown>[] = [];
    for (const img of req.images ?? []) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: img.mimeType, data: img.data },
      });
    }
    content.push({
      type: "text",
      text: `${req.prompt}\n\nReply with ONE JSON object matching this schema (${req.schemaName}) and nothing else:\n${JSON.stringify(req.jsonSchema)}`,
    });

    const body = {
      model: req.model,
      system: req.system,
      messages: [{ role: "user", content }],
      max_tokens: req.maxOutputTokens,
    };

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new AiProviderError("unavailable", err instanceof Error ? err.message : "Network error");
    }

    const json = (await res.json().catch(() => ({}))) as AnthropicMessageResponse;
    if (!res.ok) {
      throw normaliseError(res.status, json.error?.message ?? res.statusText);
    }

    if (json.stop_reason === "refusal") {
      throw new AiProviderError("refused", "Anthropic model refused request");
    }
    if (json.stop_reason === "max_tokens") {
      throw new AiProviderError("truncated", "Anthropic output hit max_tokens");
    }

    const text = (json.content ?? [])
      .filter((c) => c.type === "text" || c.text !== undefined)
      .map((c) => c.text ?? "")
      .join("");
    const inputTokens =
      (json.usage?.input_tokens ?? 0) +
      (json.usage?.cache_read_input_tokens ?? 0) +
      (json.usage?.cache_creation_input_tokens ?? 0);
    const outputTokens = json.usage?.output_tokens ?? 0;

    return { text, inputTokens, outputTokens };
  },

  async stream(apiKey: string, req: AiChatRequest, onText: (delta: string) => void): Promise<AiGenerateResult> {
    const result = await this.generate(apiKey, {
      model: req.model,
      system: req.system,
      prompt: req.messages.map((m) => `${m.role}: ${m.content}`).join("\n\n"),
      schemaName: "chat",
      jsonSchema: { type: "object", properties: { reply: { type: "string" } }, required: ["reply"], additionalProperties: false },
      maxOutputTokens: req.maxOutputTokens,
    });
    onText(result.text);
    return result;
  },

  async listModels(apiKey: string): Promise<AiModelInfo[]> {
    if (!apiKey || apiKey.trim().length < 10) {
      throw new AiProviderError("auth", "API key is too short", 401);
    }
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/models`, {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new AiProviderError("unavailable", err instanceof Error ? err.message : "Network error");
    }

    const json = (await res.json().catch(() => ({}))) as {
      data?: { id: string; display_name?: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      throw normaliseError(res.status, json.error?.message ?? res.statusText);
    }

    return (json.data ?? []).map((m) => ({
      id: m.id,
      label: m.display_name ?? m.id,
      tier: modelTier("anthropic", m.id),
    }));
  },
};
