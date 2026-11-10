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
import { checkServerAddress, OLLAMA_CLOUD } from "./server-address";

function resolveBaseUrl(raw?: string): string {
  const checked = checkServerAddress(raw || OLLAMA_CLOUD, env.NODE_ENV !== "production");
  if ("problem" in checked) {
    throw new AiProviderError("invalid_request", checked.problem, 400);
  }
  return checked.url;
}

function normaliseError(status: number | undefined, message: string): AiProviderError {
  if (isAccountProblem(status, message)) return new AiProviderError("account", message, status);
  if (status === 401 || status === 403) return new AiProviderError("auth", message, status);
  if (status === 429) return new AiProviderError("rate_limit", message, status);
  if (status !== undefined && status >= 400 && status < 500) {
    return new AiProviderError("invalid_request", message, status);
  }
  return new AiProviderError("unavailable", message || "Ollama could not be reached", status);
}

/**
 * Ollama adapter via the /api/chat and /api/tags HTTP endpoints.
 */
export const ollamaProvider: AiProvider = {
  id: "ollama",

  async generate(apiKey: string, req: AiGenerateRequest): Promise<AiGenerateResult> {
    const baseUrl = resolveBaseUrl(req.baseUrl);
    const timeoutMs = req.timeoutMs ?? env.AI_REQUEST_TIMEOUT_MS;
    const schemaInstruction = `Reply with one JSON object and nothing else: no explanation and no code fence. Include every field. It must match this JSON Schema:\n${JSON.stringify(req.jsonSchema)}`;
    const system = `${req.system}\n\n${schemaInstruction}`;

    const estimatedTokens = Math.ceil((system.length + req.prompt.length) / 3) + 2048 + (req.images?.length ?? 0) * 1500;
    const numCtx = estimatedTokens > 4096 ? Math.min(32768, Math.ceil(estimatedTokens / 1024) * 1024) : 4096;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: req.model,
          stream: false,
          format: req.jsonSchema,
          options: { num_predict: req.maxOutputTokens, num_ctx: numCtx },
          messages: [
            { role: "system", content: system },
            {
              role: "user",
              content: req.prompt,
              ...(req.images && req.images.length > 0 ? { images: req.images.map((i) => i.data) } : {}),
            },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new AiProviderError("unavailable", err instanceof Error ? err.message : "Network error");
    }

    const json = (await res.json().catch(() => ({}))) as {
      message?: { content?: string };
      done_reason?: string;
      prompt_eval_count?: number;
      eval_count?: number;
      error?: string;
    };
    if (!res.ok) {
      throw normaliseError(res.status, json.error ?? res.statusText);
    }
    if (json.done_reason === "length") {
      throw new AiProviderError("truncated", "Ollama output hit num_predict limit");
    }

    return {
      text: json.message?.content ?? "",
      inputTokens: json.prompt_eval_count ?? 0,
      outputTokens: json.eval_count ?? 0,
    };
  },

  /** A plain-text, multi-turn chat reply, delivered to onText in one piece. A reply cut short is kept, not thrown. */
  async stream(apiKey: string, req: AiChatRequest, onText: (delta: string) => void): Promise<AiGenerateResult> {
    const baseUrl = resolveBaseUrl(req.baseUrl);
    const length = req.system.length + req.messages.reduce((sum, m) => sum + m.content.length, 0);
    const estimatedTokens = Math.ceil(length / 3) + req.maxOutputTokens;
    const numCtx = estimatedTokens > 4096 ? Math.min(32768, Math.ceil(estimatedTokens / 1024) * 1024) : 4096;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: req.model,
          stream: false,
          options: { num_predict: req.maxOutputTokens, num_ctx: numCtx },
          messages: [{ role: "system", content: req.system }, ...req.messages.map((m) => ({ role: m.role, content: m.content }))],
        }),
        signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new AiProviderError("unavailable", err instanceof Error ? err.message : "Network error");
    }

    const json = (await res.json().catch(() => ({}))) as {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
      error?: string;
    };
    if (!res.ok) {
      throw normaliseError(res.status, json.error ?? res.statusText);
    }

    const text = json.message?.content ?? "";
    onText(text);
    return { text, inputTokens: json.prompt_eval_count ?? 0, outputTokens: json.eval_count ?? 0 };
  },

  async listModels(apiKey: string, rawBaseUrl?: string): Promise<AiModelInfo[]> {
    const baseUrl = resolveBaseUrl(rawBaseUrl);
    const headers: Record<string, string> = {};
    if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`;

    let res: Response;
    try {
      res = await fetch(`${baseUrl}/api/tags`, {
        headers,
        signal: AbortSignal.timeout(env.AI_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new AiProviderError("unavailable", err instanceof Error ? err.message : "Network error");
    }

    const json = (await res.json().catch(() => ({}))) as {
      models?: { name: string }[];
      error?: string;
    };
    if (!res.ok) {
      throw normaliseError(res.status, json.error ?? res.statusText);
    }

    return (json.models ?? []).map((m) => ({
      id: m.name,
      label: m.name,
      tier: null,
    }));
  },
};
