import { useCallback } from "react";
import { QUERY_KEYS, REFERENCE_POLICY, invalidateQueries } from "../cache/queryClient";
import { createRole, deleteRole, fetchPermissionCatalog, fetchRoles, updateRole } from "../endpoints/role.endpoints";
import type { NewRoleBody, PermissionCatalog, Role, RolePatch } from "../types/role.types";
import { useLoader } from "./useLoader";

/** Every role (built-in and created), with its permissions and how many people hold it. Cached; dropped on any role change. */
export function useRoles(enabled = true) {
  const { data, ...state } = useLoader(enabled ? [...QUERY_KEYS.roles, "list"] : null, async () => (await fetchRoles()).data ?? [], REFERENCE_POLICY);
  return { roles: data ?? ([] as Role[]), ...state };
}

/** Every permission there is, grouped, and the powers only administrators hold. */
export function usePermissionCatalog() {
  const { data, ...state } = useLoader([...QUERY_KEYS.roles, "catalog"], async () => (await fetchPermissionCatalog()).data ?? null, REFERENCE_POLICY);
  return { catalog: data as PermissionCatalog | null, ...state };
}

/** Creating, changing and deleting roles. Each rejects with an ApiError so a form can show why. */
export function useRoleActions() {
  const done = <T,>(value: T) => {
    invalidateQueries(QUERY_KEYS.roles);
    // A role's name shows on the Users screen too.
    invalidateQueries(QUERY_KEYS.users);
    return value;
  };
  return {
    create: useCallback(async (body: NewRoleBody) => done((await createRole(body)).data), []),
    update: useCallback(async (code: string, patch: RolePatch) => done((await updateRole(code, patch)).data), []),
    remove: useCallback(async (code: string) => done((await deleteRole(code)).data), []),
  };
}
