import { z } from "zod";
import { AI_PROVIDERS } from "./providers/ai-provider";

const providerEnum = z.enum(AI_PROVIDERS, { error: "Choose anthropic, openai, gemini or ollama" });

export const providerParamSchema = z.object({
  params: z.object({
    provider: providerEnum,
  }),
});

export const saveAiCredentialSchema = z.object({
  body: z
    .object({
      provider: providerEnum,
      model: z.string().trim().min(1, "Choose a model").max(120),
      chatModel: z.string().trim().max(120).nullable().optional(),
      baseUrl: z.string().trim().max(300).nullable().optional(),
      apiKey: z.string().trim().max(500).optional(),
    })
    .strict(),
});
export type SaveAiCredentialBody = z.infer<typeof saveAiCredentialSchema>["body"];

export const listModelsSchema = z.object({
  params: z.object({
    provider: providerEnum,
  }),
  body: z
    .object({
      apiKey: z.string().trim().max(500).optional(),
      baseUrl: z.string().trim().max(300).nullable().optional(),
    })
    .strict()
    .default({}),
});
export type ListModelsBody = z.infer<typeof listModelsSchema>["body"];

/** The chat history is kept on the server, so a question carries only itself and which chat it belongs to. */
export const assistantChatSchema = z.object({
  body: z
    .object({
      conversationId: z.uuid("Not a valid chat id").optional(),
      message: z.string().trim().min(1, "Ask a question").max(4000, "Keep your question under 4,000 characters"),
      areaId: z.uuid("Not a valid area id").optional(),
      page: z.string().trim().max(200).optional(),
    })
    .strict(),
});
export type AssistantChatBody = z.infer<typeof assistantChatSchema>["body"];

export const conversationIdSchema = z.object({
  params: z.object({ id: z.uuid("Not a valid chat id") }),
});
