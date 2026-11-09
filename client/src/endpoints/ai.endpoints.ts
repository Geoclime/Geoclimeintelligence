import { httpClient } from "../transport/http";
import type { AiCredential, AiModelOption, AiProviderId, AiStatus, SaveAiCredentialInput } from "../types/ai.types";
import type { ApiResponse } from "../types/api.types";

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
