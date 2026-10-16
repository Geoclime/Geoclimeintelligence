import { notConnected, type AiProvider } from "./ai-provider";

/**
 * Anthropic adapter. Not connected yet: Phase 1 adds the SDK and replaces these placeholders
 * (docs/ai-integration.md, "Provider adapters"). Until then every call fails as "unavailable".
 *
 * To build: @anthropic-ai/sdk; JSON via output_config.format (json_schema); chat via messages.stream
 * with the system prompt cached; stop_reason "refusal" -> refused, "max_tokens" -> truncated; input
 * tokens include cache reads and writes; image blocks go before the text. No thinking/effort params.
 */
export const anthropicProvider: AiProvider = {
  id: "anthropic",
  generate: () => notConnected("anthropic"),
  stream: () => notConnected("anthropic"),
  listModels: () => notConnected("anthropic"),
};
