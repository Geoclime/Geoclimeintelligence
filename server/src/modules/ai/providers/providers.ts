import type { AiProvider, AiProviderId } from "./ai-provider";
import { anthropicProvider } from "./anthropic.provider";
import { geminiProvider } from "./gemini.provider";
import { ollamaProvider } from "./ollama.provider";
import { openaiProvider } from "./openai.provider";

const providers: Record<AiProviderId, AiProvider> = {
  anthropic: anthropicProvider,
  openai: openaiProvider,
  gemini: geminiProvider,
  ollama: ollamaProvider,
};

/** Services take one of these in their constructor, so tests can inject a fake provider. */
export type AiProviderResolver = (id: AiProviderId) => AiProvider;

export const providerFor: AiProviderResolver = (id) => providers[id];
