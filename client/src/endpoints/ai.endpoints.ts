import { httpClient } from "../transport/http";
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
import type { ApiResponse } from "../types/api.types";

/** Asks the in-app assistant, in a new chat or one the person already has. The server keeps the history. */
export async function sendAssistantMessage(body: AssistantChatBody): Promise<ApiResponse<AssistantReply>> {
  const { data } = await httpClient.post<ApiResponse<AssistantReply>>("/api/v1/ai/chat", body);
  return data;
}

export async function fetchAiConversations(): Promise<ApiResponse<AiConversationSummary[]>> {
  const { data } = await httpClient.get<ApiResponse<AiConversationSummary[]>>("/api/v1/ai/conversations");
  return data;
}

export async function fetchAiConversation(id: string): Promise<ApiResponse<AiConversation>> {
  const { data } = await httpClient.get<ApiResponse<AiConversation>>(`/api/v1/ai/conversations/${encodeURIComponent(id)}`);
  return data;
}

export async function deleteAiConversation(id: string): Promise<ApiResponse<null>> {
  const { data } = await httpClient.delete<ApiResponse<null>>(`/api/v1/ai/conversations/${encodeURIComponent(id)}`);
  return data;
}

export async function deleteAllAiConversations(): Promise<ApiResponse<{ deleted: number }>> {
  const { data } = await httpClient.delete<ApiResponse<{ deleted: number }>>("/api/v1/ai/conversations");
  return data;
}

export async function fetchAiStatus(): Promise<ApiResponse<AiStatus>> {
  const { data } = await httpClient.get<ApiResponse<AiStatus>>("/api/v1/ai/status");
  return data;
}

export async function fetchPlatformAiCredentials(): Promise<ApiResponse<AiCredential[]>> {
  const { data } = await httpClient.get<ApiResponse<AiCredential[]>>("/api/v1/ai/platform/credentials");
  return data;
}

export async function savePlatformAiCredential(input: SaveAiCredentialInput): Promise<ApiResponse<AiCredential>> {
  const { data } = await httpClient.put<ApiResponse<AiCredential>>("/api/v1/ai/platform/credentials", input);
  return data;
}

export async function activatePlatformAiCredential(provider: AiProviderId): Promise<ApiResponse<AiCredential>> {
  const { data } = await httpClient.post<ApiResponse<AiCredential>>(`/api/v1/ai/platform/credentials/${encodeURIComponent(provider)}/activate`);
  return data;
}

export async function removePlatformAiCredential(provider: AiProviderId): Promise<ApiResponse<null>> {
  const { data } = await httpClient.delete<ApiResponse<null>>(`/api/v1/ai/platform/credentials/${encodeURIComponent(provider)}`);
  return data;
}

export async function fetchPlatformProviderModels(
  provider: AiProviderId,
  body: { apiKey?: string; baseUrl?: string | null } = {},
): Promise<ApiResponse<AiModelOption[]>> {
  const { data } = await httpClient.post<ApiResponse<AiModelOption[]>>(
    `/api/v1/ai/platform/credentials/${encodeURIComponent(provider)}/models`,
    body,
  );
  return data;
}
