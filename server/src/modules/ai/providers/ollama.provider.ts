import { notConnected, type AiProvider } from "./ai-provider";

/**
 * Ollama adapter. Not connected yet: Phase 1 adds the SDK and replaces these placeholders
 * (docs/ai-integration.md, "Provider adapters"). Until then every call fails as "unavailable".
 *
 * To build: ollama; Ollama Cloud (https://ollama.com) or the owner's own server, always through
 * checkServerAddress; wrap fetch with AbortSignal.timeout; pass the schema as `format` AND in words
 * in the system prompt; raise num_ctx when the prompt is longer than ~4096 tokens; done_reason
 * "length" -> truncated.
 */
export const ollamaProvider: AiProvider = {
  id: "ollama",
  generate: () => notConnected("ollama"),
  stream: () => notConnected("ollama"),
  listModels: () => notConnected("ollama"),
};
