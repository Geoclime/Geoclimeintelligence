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

const API_BASE = "https://api.openai.com/v1";

interface OpenAiChatResponse {
  choices?: {
    finish_reason?: string;
    message?: { content?: string | null; refusal?: string | null };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string; type?: string };
}

function normaliseError(status: number | undefined, message: string): AiProviderError {
  if (isAccountProblem(status, message)) return new AiProviderError("account", message, status);
  if (status === 401 || status === 403) return new AiProviderError("auth", message, status);
  if (status === 429) return new AiProviderError("rate_limit", message, status);
  if (status !== undefined && status >= 400 && status < 500) {
    return new AiProviderError("invalid_request", message, status);
  }
  return new AiProviderError("unavailable", message || "OpenAI could not be reached", status);
}

/**
 * OpenAI adapter via the v1 REST API.
 */
export const openaiProvider: AiProvider = {
  id: "openai",

  async generate(apiKey: string, req: AiGenerateRequest): Promise<AiGenerateResult> {
    if (!apiKey || apiKey.trim().length < 10) {
      throw new AiProviderError("auth", "API key is too short", 401);
    }
    const timeoutMs = req.timeoutMs ?? env.AI_REQUEST_TIMEOUT_MS;
    const content: Record<string, unknown>[] = [{ type: "text", text: req.prompt }];
    for (const img of req.images ?? []) {
      content.push({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.data}` },
      });
    }

    const body = {
      model: req.model,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: req.schemaName,
          schema: req.jsonSchema,
          strict: true,
        },
      },
      max_completion_tokens: req.maxOutputTokens,
    };

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new AiProviderError("unavailable", err instanceof Error ? err.message : "Network error");
    }

    const json = (await res.json().catch(() => ({}))) as OpenAiChatResponse;
    if (!res.ok) {
      throw normaliseError(res.status, json.error?.message ?? res.statusText);
    }

    const choice = json.choices?.[0];
    if (choice?.finish_reason === "content_filter" || choice?.message?.refusal) {
      throw new AiProviderError("refused", choice.message?.refusal ?? "Content filtered");
    }
    if (choice?.finish_reason === "length") {
      throw new AiProviderError("truncated", "Output reached max_completion_tokens");
    }

    return {
      text: choice?.message?.content ?? "",
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
  },

  /** A plain-text, multi-turn chat reply, delivered to onText in one piece. A reply cut short is kept, not thrown. */
  async stream(apiKey: string, req: AiChatRequest, onText: (delta: string) => void): Promise<AiGenerateResult> {
    if (!apiKey || apiKey.trim().length < 10) {
      throw new AiProviderError("auth", "API key is too short", 401);
    }
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: req.model,
          messages: [{ role: "system", content: req.system }, ...req.messages.map((m) => ({ role: m.role, content: m.content }))],
          max_completion_tokens: req.maxOutputTokens,
        }),
        signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new AiProviderError("unavailable", err instanceof Error ? err.message : "Network error");
    }

    const json = (await res.json().catch(() => ({}))) as OpenAiChatResponse;
    if (!res.ok) {
      throw normaliseError(res.status, json.error?.message ?? res.statusText);
    }
    const choice = json.choices?.[0];
    if (choice?.finish_reason === "content_filter" || choice?.message?.refusal) {
      throw new AiProviderError("refused", choice.message?.refusal ?? "Content filtered");
    }

    const text = choice?.message?.content ?? "";
    onText(text);
    return {
      text,
      inputTokens: json.usage?.prompt_tokens ?? 0,
      outputTokens: json.usage?.completion_tokens ?? 0,
    };
  },

  async listModels(apiKey: string): Promise<AiModelInfo[]> {
    if (!apiKey || apiKey.trim().length < 10) {
      throw new AiProviderError("auth", "API key is too short", 401);
    }
    let res: Response;
    try {
      res = await fetch(`${API_BASE}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new AiProviderError("unavailable", err instanceof Error ? err.message : "Network error");
    }

    const json = (await res.json().catch(() => ({}))) as {
      data?: { id: string; created?: number }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      throw normaliseError(res.status, json.error?.message ?? res.statusText);
    }

    return (json.data ?? [])
      .filter(
        (m) =>
          /^(gpt-|o\d|chatgpt-)/i.test(m.id) &&
          !/(audio|realtime|tts|transcribe|image|embedding|instruct|search|moderation)/i.test(m.id),
      )
      .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
      .map((m) => ({
        id: m.id,
        label: m.id,
        tier: modelTier("openai", m.id),
      }));
  },
};
