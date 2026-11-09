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

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const REFUSED_REASONS = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII"]);

interface GeminiCandidate {
  content?: { parts?: { text?: string }[] };
  finishReason?: string;
}

interface GeminiResponse {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
  error?: { code?: number; message?: string };
}

function normaliseError(status: number | undefined, message: string): AiProviderError {
  if (isAccountProblem(status, message)) return new AiProviderError("account", message, status);
  if (status === 401 || status === 403 || (status === 400 && /api[_\s-]?key/i.test(message))) {
    return new AiProviderError("auth", message, status);
  }
  if (status === 429) return new AiProviderError("rate_limit", message, status);
  if (status !== undefined && status >= 400 && status < 500) {
    return new AiProviderError("invalid_request", message, status);
  }
  return new AiProviderError("unavailable", message || "Gemini could not be reached", status);
}

/**
 * Google Gemini adapter via the REST v1beta API (zero external SDK dependencies).
 */
export const geminiProvider: AiProvider = {
  id: "gemini",

  async generate(apiKey: string, req: AiGenerateRequest): Promise<AiGenerateResult> {
    if (!apiKey || apiKey.trim().length < 10) {
      throw new AiProviderError("auth", "API key is too short", 401);
    }
    const timeoutMs = req.timeoutMs ?? env.AI_REQUEST_TIMEOUT_MS;
    const parts: Record<string, unknown>[] = [];
    for (const img of req.images ?? []) {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
    parts.push({ text: req.prompt });

    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: req.jsonSchema,
        maxOutputTokens: req.maxOutputTokens,
      },
    };

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/models/${encodeURIComponent(req.model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new AiProviderError("unavailable", err instanceof Error ? err.message : "Network error");
    }

    const json = (await res.json().catch(() => ({}))) as GeminiResponse;
    if (!res.ok) {
      throw normaliseError(res.status, json.error?.message ?? res.statusText);
    }

    if (json.promptFeedback?.blockReason) {
      throw new AiProviderError("refused", `Blocked: ${json.promptFeedback.blockReason}`);
    }
    const candidate = json.candidates?.[0];
    const finish = candidate?.finishReason ?? "";
    if (REFUSED_REASONS.has(finish)) {
      throw new AiProviderError("refused", `Finish reason: ${finish}`);
    }
    if (finish === "MAX_TOKENS") {
      throw new AiProviderError("truncated", "Output reached MAX_TOKENS");
    }

    const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    const inputTokens = json.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = (json.usageMetadata?.candidatesTokenCount ?? 0) + (json.usageMetadata?.thoughtsTokenCount ?? 0);
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
      res = await fetch(`${API_BASE}/models?key=${encodeURIComponent(apiKey)}`, {
        signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new AiProviderError("unavailable", err instanceof Error ? err.message : "Network error");
    }

    const json = (await res.json().catch(() => ({}))) as {
      models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      throw normaliseError(res.status, json.error?.message ?? res.statusText);
    }

    const models: AiModelInfo[] = [];
    for (const m of json.models ?? []) {
      const id = (m.name ?? "").replace(/^models\//, "");
      if (!id.startsWith("gemini")) continue;
      if (!(m.supportedGenerationMethods ?? []).includes("generateContent")) continue;
      if (/(tts|image|audio|embedding|live|native-audio|robotics|computer-use)/i.test(id)) continue;
      models.push({
        id,
        label: m.displayName ?? id,
        tier: modelTier("gemini", id),
      });
    }
    return models;
  },
};
