import type { AiModelInfo, AiProviderId } from "./ai-provider";

export type ModelTier = NonNullable<AiModelInfo["tier"]>;

/**
 * Providers don't publish a tier, so it is read from the model's name to help the settings UI
 * advise people. Cosmetic only: nothing may depend on it except that advice. Unknown -> null.
 */
export function modelTier(provider: AiProviderId, modelId: string): ModelTier | null {
  const id = modelId.toLowerCase();
  switch (provider) {
    case "anthropic":
      if (id.includes("haiku")) return "fast";
      if (id.includes("sonnet")) return "balanced";
      if (/opus|fable|mythos/.test(id)) return "capable";
      return null;
    case "openai":
      if (/nano|mini/.test(id)) return "fast";
      if (/^(gpt-|o\d)/.test(id)) return "capable";
      return null;
    case "gemini":
      if (/flash-(lite|8b)/.test(id)) return "fast";
      if (id.includes("flash")) return "balanced";
      if (/pro|ultra/.test(id)) return "capable";
      return null;
    case "ollama":
      return null;
  }
}
