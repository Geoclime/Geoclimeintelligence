import { useCallback, useMemo } from "react";
import { invalidateQueries, LIVE_POLICY, QUERY_KEYS } from "../cache/queryClient";
import { fetchUsers } from "../endpoints/user.endpoints";
import type { PaginationMeta } from "../types/api.types";
import type { UserRole } from "../types/auth.types";
import type { ManagedUser } from "../types/user.types";
import { paginationDetails } from "../utils/pagination";
import { useLoader } from "./useLoader";

interface UseUsersOptions {
  page: number;
  pageSize?: number;
  /** Name, email or organisation contains this text. Debounce it first. */
  q?: string;
  role?: UserRole;
  /** Only accounts with an open role request. */
  pendingRequest?: boolean;
}

interface UsersPage {
  users: ManagedUser[];
  meta: PaginationMeta;
}

/**
 * One page of platform accounts for the Administrator user list: the request, loading, error,
 * page metadata and refetch (standard section 7), through the shared loader. There is no
 * owner/user filter: the backend decides who may call this (Administrators only).
 *
 * Remembered for 30 seconds per page and filter, so going back to a page you just left is instant;
 * changing an account clears the other pages, since it can move between filtered lists (out of
 * "pending requests", say). While the next page loads, the previous rows stay on screen.
 */
export function useUsers({ page, pageSize = 25, q, role, pendingRequest }: UseUsersOptions) {
  const key = useMemo(() => [...QUERY_KEYS.users, page, pageSize, q ?? "", role ?? "", pendingRequest ? "requests" : ""], [page, pageSize, q, role, pendingRequest]);
  const { data, setData, loading, error, refetch } = useLoader<UsersPage>(
    key,
    async () => {
      const response = await fetchUsers({ page, pageSize, q: q || undefined, role, pendingRequest: pendingRequest || undefined });
      return { users: response.data ?? [], meta: response.meta ?? {} };
    },
    LIVE_POLICY,
  );

  /** Swaps in a row the server just returned (e.g. after an access change) without a refetch. */
  const replaceUser = useCallback(
    (updated: ManagedUser) => {
      invalidateQueries(QUERY_KEYS.users, key);
      setData((current) => current && { ...current, users: current.users.map((user) => (user.id === updated.id ? updated : user)) });
    },
    [key, setData],
  );

  const meta = data?.meta ?? {};
  return { users: data?.users ?? [], meta, loading, error, ...paginationDetails(meta), refetch, replaceUser };
}
