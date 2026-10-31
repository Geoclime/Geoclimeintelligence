import { hashKey, keepPreviousData, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import type { CachePolicy } from "../cache/queryClient";
import { toApiError } from "../transport/api-error";

/** TanStack needs a key even for a query that is switched off. */
const IDLE_KEY: QueryKey = ["idle"];

/**
 * The request/loading/error/refetch lifecycle that every read hook shares, so it is written once
 * (standard section 1: shared logic lives in hooks). It is NOT a generic useApi(url): it takes a
 * loader that already calls one named endpoint function, and only the feature hooks in this
 * folder use it. It is a thin layer over TanStack Query (cache/queryClient.ts), giving the hooks
 * one small, stable contract:
 *   - `queryKey` says everything the answer depends on (area, page, filters) and nothing it doesn't;
 *     a null key means "not yet": nothing is requested;
 *   - `loading` is true only while there is nothing to show: either no answer yet, or the answer
 *     for a new key is on its way and the previous one is still on screen;
 *   - `data`, `error`, `errorStatus` and `refetch` as before. A background re-fetch that fails
 *     keeps the old answer on screen instead of replacing it with an error.
 *
 * With a cache `policy` the answer is remembered across screens: opening a screen again shows the
 * last answer at once, nothing is asked while it is fresh, and once stale it is re-fetched behind
 * it. Without one nothing is remembered once the screen closes and every open asks the server:
 * use that for things that must be current (an import's progress).
 */
export function useLoader<T>(queryKey: QueryKey | null, load: () => Promise<T>, policy?: CachePolicy) {
  const client = useQueryClient();
  const query = useQuery<T>({
    queryKey: queryKey ?? IDLE_KEY,
    queryFn: load,
    enabled: queryKey !== null,
    staleTime: policy?.staleMs ?? 0,
    gcTime: policy?.gcMs ?? 0,
    // Coming back to the tab only re-asks things that are remembered and gone stale.
    refetchOnWindowFocus: policy !== undefined,
    // The previous page, tab or area stays on screen while the next one loads.
    placeholderData: keepPreviousData,
  });

  // setData keeps a stable identity (hooks list it as a dependency) while the key array is rebuilt every render.
  const keyRef = useRef(queryKey);
  useEffect(() => {
    keyRef.current = queryKey;
  });
  const keyHash = queryKey === null ? null : hashKey(queryKey);

  /** Always asks the server, even when the remembered answer is fresh. */
  const { refetch: refetchQuery } = query;
  const refetch = useCallback(() => void refetchQuery(), [refetchQuery]);

  /**
   * Replaces the loaded data locally (e.g. with what a write just returned) without a refetch.
   * It replaces the remembered answer, so other screens showing it see the change too.
   */
  const setData = useCallback(
    (update: (current: T | null) => T | null) => {
      const current = keyRef.current;
      if (current === null) return;
      client.setQueryData<T>(current, (old) => {
        const next = update(old ?? null);
        return next === null ? old : next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [client, keyHash],
  );

  const loading = queryKey !== null && (query.isPending || query.isPlaceholderData);
  const failed = queryKey !== null && query.isError && query.data === undefined;
  const apiError = failed ? toApiError(query.error) : null;
  return {
    data: query.data ?? null,
    loading,
    /** An older answer is on screen while a newer one is fetched behind it. */
    refreshing: queryKey !== null && query.isFetching && !loading,
    error: apiError?.message ?? null,
    errorStatus: apiError?.status ?? null,
    refetch,
    setData,
  };
}
