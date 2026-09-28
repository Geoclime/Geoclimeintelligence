import { useCallback } from "react";
import { updateUserAccess } from "../endpoints/user.endpoints";
import type { ManagedUser, UserAccessPatch } from "../types/user.types";

/**
 * Changes an account's role and/or region scope. Rejects with an ApiError so the form can put
 * a 400's per-field errors next to the right inputs; submitting state lives in react-hook-form.
 */
export function useUpdateUserAccess() {
  const saveAccess = useCallback(async (userId: string, patch: UserAccessPatch): Promise<ManagedUser> => {
    const response = await updateUserAccess(userId, patch);
    if (!response.data) throw new Error(response.message || "The server returned no user record.");
    return response.data;
  }, []);

  return { saveAccess };
}
