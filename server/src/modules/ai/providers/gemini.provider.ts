import { notConnected, type AiProvider } from "./ai-provider";

/**
 * Google Gemini adapter. Not connected yet: Phase 1 adds the SDK and replaces these placeholders
 * (docs/ai-integration.md, "Provider adapters"). Until then every call fails as "unavailable".
 *
 * To build: @google/genai; JSON via responseMimeType + responseJsonSchema; generateContentStream with
 * role assistant -> model; blockReason or a SAFETY-type finish -> refused, MAX_TOKENS -> truncated;
 * output tokens = candidates + thoughts; a bad key comes back as 400 mentioning "api key" -> auth.
 */
export const geminiProvider: AiProvider = {
  id: "gemini",
  generate: () => notConnected("gemini"),
  stream: () => notConnected("gemini"),
  listModels: () => notConnected("gemini"),
};
