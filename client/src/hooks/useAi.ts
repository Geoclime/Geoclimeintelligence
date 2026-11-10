import { useCallback } from "react";
import { invalidateQueries, QUERY_KEYS, SETTINGS_POLICY } from "../cache/queryClient";
import {
  activatePlatformAiCredential,
  fetchAiStatus,
  fetchPlatformAiCredentials,
  fetchPlatformProviderModels,
  removePlatformAiCredential,
  savePlatformAiCredential,
  sendAssistantMessage,
} from "../endpoints/ai.endpoints";
import type {
  AiCredential,
  AiModelOption,
  AiProviderId,
  AiStatus,
  AssistantChatBody,
  AssistantReply,
  SaveAiCredentialInput,
} from "../types/ai.types";
import { useLoader } from "./useLoader";

/** Asks the AI assistant one question (with the conversation so far). Nothing is cached: every answer is fresh. */
export function useAssistantChat() {
  const ask = useCallback(async (body: AssistantChatBody): Promise<AssistantReply> => {
    const res = await sendAssistantMessage(body);
    return res.data!;
  }, []);
  return { ask };
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
