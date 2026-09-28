import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { AuthUser } from "../types/auth.types";

// Thin on purpose (standard section 6): sign-up, sign-in and password reset go straight to
// Firebase through transport/identity.ts. This backend only ever sees the resulting ID token.

/**
 * The backend's view of the signed-in user: role and region scope from Postgres. The first call
 * for a new Firebase account also creates its `users` row, as General Public.
 *
 * The standard's example calls this route GET /api/v1/me; the backend mounts it at
 * /api/v1/auth/me (server/src/modules/auth/auth.routes.ts), which is what is used here.
 */
export async function fetchCurrentUser(): Promise<ApiResponse<AuthUser>> {
  const { data } = await httpClient.get<ApiResponse<AuthUser>>("/api/v1/auth/me");
  return data;
}
