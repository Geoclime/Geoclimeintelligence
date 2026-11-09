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
