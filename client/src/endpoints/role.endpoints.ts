import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { NewRoleBody, PermissionCatalog, Role, RolePatch } from "../types/role.types";

// server/src/modules/roles/role.routes.ts. Anyone signed in may list roles; only administrators may change them.

export async function fetchRoles(): Promise<ApiResponse<Role[]>> {
  const { data } = await httpClient.get<ApiResponse<Role[]>>("/api/v1/roles");
  return data;
}

export async function fetchPermissionCatalog(): Promise<ApiResponse<PermissionCatalog>> {
  const { data } = await httpClient.get<ApiResponse<PermissionCatalog>>("/api/v1/roles/permissions");
  return data;
}

export async function createRole(body: NewRoleBody): Promise<ApiResponse<Role>> {
  const { data } = await httpClient.post<ApiResponse<Role>>("/api/v1/roles", body);
  return data;
}

export async function updateRole(code: string, patch: RolePatch): Promise<ApiResponse<Role>> {
  const { data } = await httpClient.patch<ApiResponse<Role>>(`/api/v1/roles/${encodeURIComponent(code)}`, patch);
  return data;
}

export async function deleteRole(code: string): Promise<ApiResponse<null>> {
  const { data } = await httpClient.delete<ApiResponse<null>>(`/api/v1/roles/${encodeURIComponent(code)}`);
  return data;
}
