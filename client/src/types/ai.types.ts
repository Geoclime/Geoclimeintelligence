/**
 * Mirrors server/src/modules/ai (ai-provider.ts, domain/ai-features.ts, ai.types.ts).
 * If one changes, both change in the same PR. See docs/ai-integration.md.
 */

export const AI_PROVIDERS = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Google Gemini" },
  { id: "ollama", label: "Ollama" },
] as const;
export type AiProviderId = (typeof AI_PROVIDERS)[number]["id"];

/**
 * Every AI feature, with the label and description the settings page shows. Empty until the
 * first features are built; each entry's `id` matches the server's AI_FEATURES.
 */
export const AI_FEATURES = [] as const satisfies readonly { id: string; label: string; description: string }[];
export type AiFeature = (typeof AI_FEATURES)[number]["id"];

export type AiKeySource = "user" | "platform";

/** Mirrors AiStatusDto: whether AI can be used right now, and on whose key. */
export interface AiStatus {
  available: boolean;
  source: AiKeySource | null;
  provider: AiProviderId | null;
  providerLabel: string | null;
  model: string | null;
  /** false when the server has no AI_KEYS_SECRET, so no key can be saved. */
  storageReady: boolean;
}

/** "1 credit" / "3 credits". */
export const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;
