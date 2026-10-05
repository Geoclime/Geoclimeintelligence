import { useCallback, useEffect, useRef, useState } from "react";
import { toApiError } from "../transport/api-error";

interface LoadResult<T> {
  /** Which request this result answers; `loading` is true until it matches the current one. */
  requestKey: string;
  data: T | null;
  error: string | null;
  errorStatus: number | null;
}

/**
 * The request/loading/error/refetch lifecycle that every read hook shares, so it is written once
 * (standard section 1: shared logic lives in hooks). It is NOT a generic useApi(url): it takes a
 * loader that already calls one named endpoint function, and only the feature hooks in this
 * folder use it. Same pattern as useUsers:
 *   - `key` identifies the request; when it changes, the old response is ignored if it lands late;
 *   - `loading` is derived, and the previous data stays on screen while the next request runs;
 *   - a null key means "not yet": nothing is requested.
 */
export function useLoader<T>(key: string | null, load: () => Promise<T>) {
  const [reloadCount, setReloadCount] = useState(0);
  const [result, setResult] = useState<LoadResult<T> | null>(null);
  const loadRef = useRef(load);
  const requestKey = key === null ? null : `${key}#${reloadCount}`;

  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (requestKey === null) return;
    let superseded = false;
    loadRef.current().then(
      (data) => {
        if (!superseded) setResult({ requestKey, data, error: null, errorStatus: null });
      },
      (error: unknown) => {
        if (superseded) return;
        const apiError = toApiError(error);
        setResult((previous) => ({
          requestKey,
          data: previous?.data ?? null,
          error: apiError.message,
          errorStatus: apiError.status,
        }));
      },
    );
    return () => {
      superseded = true;
    };
  }, [requestKey]);

  const refetch = useCallback(() => setReloadCount((count) => count + 1), []);

  /** Replaces the loaded data locally (e.g. with what a write just returned) without a refetch. */
  const setData = useCallback((update: (current: T | null) => T | null) => {
    setResult((previous) => (previous ? { ...previous, data: update(previous.data) } : previous));
  }, []);

  const loading = requestKey !== null && result?.requestKey !== requestKey;
  return {
    data: result?.data ?? null,
    loading,
    error: loading ? null : (result?.error ?? null),
    errorStatus: loading ? null : (result?.errorStatus ?? null),
    refetch,
    setData,
  };
}
