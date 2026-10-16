import { notConnected, type AiProvider } from "./ai-provider";

/**
 * OpenAI adapter. Not connected yet: Phase 1 adds the SDK and replaces these placeholders
 * (docs/ai-integration.md, "Provider adapters"). Until then every call fails as "unavailable".
 *
 * To build: openai; JSON via response_format json_schema (strict); chat with stream_options.include_usage;
 * content_filter or message.refusal -> refused, "length" -> truncated; image_url data URLs after the
 * text; listModels keeps gpt-/o#/chatgpt- and drops audio, image, embedding and similar models.
 */
export const openaiProvider: AiProvider = {
  id: "openai",
  generate: () => notConnected("openai"),
  stream: () => notConnected("openai"),
  listModels: () => notConnected("openai"),
};
