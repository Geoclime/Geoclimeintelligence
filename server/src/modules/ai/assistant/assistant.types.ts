import type { AiKeySource } from "../ai.types";
import type { AiChatMessage, AiProviderId } from "../providers/ai-provider";

/** A chat in the history list. Mirrored by AiConversationSummary in client/src/types/ai.types.ts. */
export interface AiConversationSummaryDto {
  id: string;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

/** One chat, with every turn. Mirrored by AiConversation in client/src/types/ai.types.ts. */
export interface AiConversationDto {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: (AiChatMessage & { createdAt: string })[];
}

/** POST /api/v1/ai/chat. Mirrored by AssistantReply in client/src/types/ai.types.ts. */
export interface AssistantReplyDto {
  conversationId: string;
  title: string;
  reply: string;
  provider: AiProviderId;
  model: string;
  source: AiKeySource;
}

export interface NewExchange {
  userId: string;
  /** null starts a new chat with this title. */
  conversationId: string | null;
  title: string;
  question: string;
  answer: string;
}

/** Every method is scoped to the owner: someone else's chat is "not found". */
export interface IAiConversationRepository {
  list(userId: string, limit: number): Promise<AiConversationSummaryDto[]>;
  find(userId: string, id: string): Promise<Omit<AiConversationDto, "messages"> & { messageCount: number } | null>;
  messages(conversationId: string): Promise<AiConversationDto["messages"]>;
  /** The last `count` turns, oldest first. */
  recentMessages(conversationId: string, count: number): Promise<AiChatMessage[]>;
  /** Saves a question and its answer together (and the chat itself, when new). */
  appendExchange(exchange: NewExchange): Promise<{ id: string; title: string }>;
  remove(userId: string, id: string): Promise<boolean>;
  removeAll(userId: string): Promise<number>;
}
