import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { ManagedUser, UserAccessPatch, UserListParams } from "../types/user.types";

// Administrator-only routes (server/src/modules/users/user.routes.ts). Anyone else gets a 403
// from the backend no matter what the UI shows.

export async function fetchUsers(params: UserListParams): Promise<ApiResponse<ManagedUser[]>> {
  const { data } = await httpClient.get<ApiResponse<ManagedUser[]>>("/api/v1/users", { params });
  return data;
}

export async function fetchUserById(id: string): Promise<ApiResponse<ManagedUser>> {
  const { data } = await httpClient.get<ApiResponse<ManagedUser>>(`/api/v1/users/${encodeURIComponent(id)}`);
  return data;
}

export async function updateUserAccess(id: string, patch: UserAccessPatch): Promise<ApiResponse<ManagedUser>> {
  const { data } = await httpClient.patch<ApiResponse<ManagedUser>>(
    `/api/v1/users/${encodeURIComponent(id)}/access`,
    patch,
  );
  return data;
}
