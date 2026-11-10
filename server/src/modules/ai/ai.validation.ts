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

/** The most of a conversation sent back each time: older turns are dropped by the client. */
export const MAX_CHAT_MESSAGES = 20;

export const assistantChatSchema = z.object({
  body: z
    .object({
      messages: z
        .array(
          z
            .object({
              role: z.enum(["user", "assistant"]),
              content: z.string().trim().min(1, "A message can't be empty").max(4000, "Keep each message under 4,000 characters"),
            })
            .strict(),
        )
        .min(1, "Ask a question")
        .max(MAX_CHAT_MESSAGES, `Send at most ${MAX_CHAT_MESSAGES} messages; start a new chat for more`)
        // Every AI provider expects the person and the assistant to take turns, starting and ending with the person.
        .refine((messages) => messages.every((m, i) => m.role === (i % 2 === 0 ? "user" : "assistant")), {
          message: "Messages must take turns, starting with yours",
        })
        .refine((messages) => messages[messages.length - 1]?.role === "user", { message: "The last message must be your question" }),
      areaId: z.uuid("Not a valid area id").optional(),
      page: z.string().trim().max(200).optional(),
    })
    .strict(),
});
export type AssistantChatBody = z.infer<typeof assistantChatSchema>["body"];
