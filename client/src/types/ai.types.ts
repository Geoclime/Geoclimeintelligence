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
    description: "Synthesizes the forecast outlook (1 to 30 days), terrain susceptibility, and drainage status into plain-language guidance.",
  },
  {
    id: "alert_draft",
    label: "Alert drafting assistant",
    description: "Drafts official flood alert titles, messages, and resident actions from forecast data for human review.",
  },
  {
    id: "assistant_chat",
    label: "AI assistant chat",
    description: "Answers questions about flood alerts, forecasts, preparedness and how to use the platform, from the platform's current data.",
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

/** One turn of a chat with the assistant. */
export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

/** Body for POST /api/v1/ai/chat. Mirrors assistantChatSchema on the server, which keeps the history. */
export interface AssistantChatBody {
  /** The chat to carry on; leave out to start a new one. */
  conversationId?: string;
  message: string;
  /** The place on screen, or the person's home area. */
  areaId?: string;
  /** The page they have open. */
  page?: string;
}

/** Mirrors AssistantReplyDto. */
export interface AssistantReply {
  conversationId: string;
  title: string;
  reply: string;
  provider: AiProviderId;
  model: string;
  source: AiKeySource;
}

/** A chat in the history list. Mirrors AiConversationSummaryDto. */
export interface AiConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** One chat with every turn. Mirrors AiConversationDto. */
export interface AiConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: (AssistantMessage & { createdAt: string })[];
}

/** "1 credit" / "3 credits". */
export const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;
