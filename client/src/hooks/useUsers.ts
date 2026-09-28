import { useCallback, useEffect, useState } from "react";
import { fetchUsers } from "../endpoints/user.endpoints";
import { errorMessage } from "../transport/api-error";
import type { PaginationMeta } from "../types/api.types";
import type { ManagedUser } from "../types/user.types";
import { paginationDetails } from "../utils/pagination";

interface UseUsersOptions {
  page: number;
  pageSize?: number;
}

interface UsersResult {
  /** Which request this result answers; `loading` is true until it matches the current one. */
  requestKey: string;
  users: ManagedUser[];
  meta: PaginationMeta;
  error: string | null;
}

/**
 * One page of platform accounts for the Administrator user list. Owns the whole data lifecycle:
 * request, loading, error, page metadata and refetch (standard section 7). There is no
 * owner/user filter: the backend decides who may call this (Administrators only).
 *
 * `loading` is derived (the stored result doesn't answer the current request yet) instead of
 * being set at the start of the effect, so state only ever changes when a response arrives.
 * While the next page loads, the previous rows stay on screen.
 */
export function useUsers({ page, pageSize = 25 }: UseUsersOptions) {
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<UsersResult | null>(null);
  const requestKey = `${page}:${pageSize}:${reloadCount}`;

  useEffect(() => {
    // Paging quickly overlaps requests; a response for a superseded request is dropped.
    let superseded = false;
    fetchUsers({ page, pageSize }).then(
      (response) => {
        if (!superseded) {
          setResult({ requestKey, users: response.data ?? [], meta: response.meta ?? {}, error: null });
        }
      },
      (error: unknown) => {
        if (!superseded) {
          setResult((previous) => ({
            requestKey,
            users: previous?.users ?? [],
            meta: previous?.meta ?? {},
            error: errorMessage(error),
          }));
        }
      },
    );
    return () => {
      superseded = true;
    };
  }, [page, pageSize, requestKey]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  /** Swaps in a row the server just returned (e.g. after an access change) without a refetch. */
  const replaceUser = useCallback((updated: ManagedUser) => {
    setResult((previous) =>
      previous && {
        ...previous,
        users: previous.users.map((user) => (user.id === updated.id ? updated : user)),
      },
    );
  }, []);

  const loading = result?.requestKey !== requestKey;
  const meta = result?.meta ?? {};

  return {
    users: result?.users ?? [],
    meta,
    loading,
    error: loading ? null : (result?.error ?? null),
    ...paginationDetails(meta),
    refetch,
    replaceUser,
  };
}
