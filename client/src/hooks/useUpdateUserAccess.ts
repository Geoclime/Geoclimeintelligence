import { useCallback } from "react";
import { declineRoleRequest, updateUserAccess } from "../endpoints/user.endpoints";
import type { ManagedUser, UserAccessPatch } from "../types/user.types";

/**
 * Changes an account's role and/or region scope, or declines its role request. Rejects with an
 * ApiError so the form can put a 400's per-field errors next to the right inputs; submitting
 * state lives in react-hook-form. Approving a request is saving the requested role.
 */
export function useUpdateUserAccess() {
  const saveAccess = useCallback(async (userId: string, patch: UserAccessPatch): Promise<ManagedUser> => {
    const response = await updateUserAccess(userId, patch);
    if (!response.data) throw new Error(response.message || "The server returned no user record.");
    return response.data;
  }, []);

  const declineRequest = useCallback(async (userId: string): Promise<ManagedUser> => {
    const response = await declineRoleRequest(userId);
    if (!response.data) throw new Error(response.message || "The server returned no user record.");
    return response.data;
  }, []);

  return { saveAccess, declineRequest };
}
