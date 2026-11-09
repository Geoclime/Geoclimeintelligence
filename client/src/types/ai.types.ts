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
 * Every AI feature, with the label and description the settings page shows.
 * Each entry's `id` matches the server's AI_FEATURES.
 */
export const AI_FEATURES = [
  {
    id: "flood_outlook_draft",
    label: "Flood outlook narrative",
    description: "Synthesizes 7-day and seasonal forecasts, terrain susceptibility, and drainage status into plain-language guidance.",
  },
  {
    id: "alert_draft",
    label: "Alert drafting assistant",
    description: "Drafts official flood alert titles, messages, and resident actions from forecast data for human review.",
  },
] as const satisfies readonly { id: string; label: string; description: string }[];
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

export interface AiCredential {
  id: string;
  provider: AiProviderId;
  providerLabel: string;
  model: string;
  chatModel: string | null;
  baseUrl: string | null;
  keyHint: string;
  isActive: boolean;
  updatedAt: string;
}

export interface SaveAiCredentialInput {
  provider: AiProviderId;
  model: string;
  chatModel?: string | null;
  baseUrl?: string | null;
  apiKey?: string;
}

export interface AiModelOption {
  id: string;
  label: string;
  tier: "fast" | "balanced" | "capable" | null;
}

/** "1 credit" / "3 credits". */
export const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;
