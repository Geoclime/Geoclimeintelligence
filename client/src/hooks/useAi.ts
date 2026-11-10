import { useCallback } from "react";
import { invalidateQueries, QUERY_KEYS, SETTINGS_POLICY } from "../cache/queryClient";
import {
  activatePlatformAiCredential,
  deleteAiConversation,
  deleteAllAiConversations,
  fetchAiConversation,
  fetchAiConversations,
  fetchAiStatus,
  fetchPlatformAiCredentials,
  fetchPlatformProviderModels,
  removePlatformAiCredential,
  savePlatformAiCredential,
  sendAssistantMessage,
} from "../endpoints/ai.endpoints";
import type {
  AiConversation,
  AiConversationSummary,
  AiCredential,
  AiModelOption,
  AiProviderId,
  AiStatus,
  AssistantChatBody,
  AssistantReply,
  SaveAiCredentialInput,
} from "../types/ai.types";
import { useLoader } from "./useLoader";

const CONVERSATIONS_KEY = [...QUERY_KEYS.ai, "conversations"] as const;

/**
 * The AI assistant: ask a question, and the person's chat history (list, open, delete one, delete all).
 * Answers are never cached; the history list is, and every send or delete refreshes it.
 */
export function useAssistantChat(historyWanted: boolean) {
  const { data, loading, error, refetch } = useLoader<AiConversationSummary[]>(
    historyWanted ? [...CONVERSATIONS_KEY] : null,
    async () => (await fetchAiConversations()).data ?? [],
    SETTINGS_POLICY,
  );

  const ask = useCallback(async (body: AssistantChatBody): Promise<AssistantReply> => {
    const res = await sendAssistantMessage(body);
    invalidateQueries([...CONVERSATIONS_KEY]);
    return res.data!;
  }, []);

  const open = useCallback(async (id: string): Promise<AiConversation> => (await fetchAiConversation(id)).data!, []);

  const remove = useCallback(async (id: string) => {
    await deleteAiConversation(id);
    invalidateQueries([...CONVERSATIONS_KEY]);
  }, []);

  const removeAll = useCallback(async () => {
    await deleteAllAiConversations();
    invalidateQueries([...CONVERSATIONS_KEY]);
  }, []);

  return { conversations: data ?? [], historyLoading: loading, historyError: error, refetchHistory: refetch, ask, open, remove, removeAll };
}

export function useAiStatus() {
  const { data, loading, error, refetch } = useLoader<AiStatus>(
    [...QUERY_KEYS.ai, "status"],
    async () => (await fetchAiStatus()).data!,
    SETTINGS_POLICY,
  );
  return { status: data, loading, error, refetch };
}

export function usePlatformAiCredentials() {
  const { data, loading, error, refetch } = useLoader<AiCredential[]>(
    [...QUERY_KEYS.ai, "platform-credentials"],
    async () => (await fetchPlatformAiCredentials()).data ?? [],
    SETTINGS_POLICY,
  );

  const save = useCallback(async (input: SaveAiCredentialInput) => {
    const res = await savePlatformAiCredential(input);
    invalidateQueries(QUERY_KEYS.ai);
    return res.data!;
  }, []);

  const activate = useCallback(async (provider: AiProviderId) => {
    const res = await activatePlatformAiCredential(provider);
    invalidateQueries(QUERY_KEYS.ai);
    return res.data!;
  }, []);

  const remove = useCallback(async (provider: AiProviderId) => {
    await removePlatformAiCredential(provider);
    invalidateQueries(QUERY_KEYS.ai);
  }, []);

  const listModels = useCallback(
    async (provider: AiProviderId, body?: { apiKey?: string; baseUrl?: string | null }): Promise<AiModelOption[]> => {
      const res = await fetchPlatformProviderModels(provider, body);
      return res.data ?? [];
    },
    [],
  );

  return { credentials: data ?? [], loading, error, refetch, save, activate, remove, listModels };
}
