import { useCallback, useState } from "react";
import { CACHE_KEYS, invalidateCached } from "../cache/localCache";
import { fetchImportRun, promoteImportRun } from "../endpoints/import.endpoints";
import type { PaginationMeta } from "../types/api.types";
import type { ImportRun, ImportRunDetail, StagingRow } from "../types/import.types";
import { paginationDetails } from "../utils/pagination";
import { useLoader } from "./useLoader";

interface UseImportRunOptions {
  page?: number;
  pageSize?: number;
  status?: "passed" | "failed";
}

/**
 * One import run for the review screen: its counts and status, one page of staged rows with their
 * errors, and the Promote action. Not cached: a run changes when it's promoted.
 */
export function useImportRun(id: string | undefined, { page = 1, pageSize = 50, status }: UseImportRunOptions = {}) {
  const key = id ? `import-run:${id}:${page}:${pageSize}:${status ?? "all"}` : null;
  const [promoting, setPromoting] = useState(false);

  const { data, setData, ...state } = useLoader(key, async () => {
    const response = await fetchImportRun(id!, { page, pageSize, status });
    if (!response.data) throw new Error(response.message || "The server returned no import run.");
    return { detail: response.data, meta: response.meta ?? {} };
  });

  /** Copies the passed rows into the live table. Rejects with an ApiError (e.g. 409). */
  const promote = useCallback(async (): Promise<ImportRun> => {
    if (!id) throw new Error("No import run to promote.");
    setPromoting(true);
    try {
      const response = await promoteImportRun(id);
      if (!response.data) throw new Error(response.message || "The server returned no import run.");
      const run = response.data;
      // New areas are live: every cached area list and map count is now out of date.
      invalidateCached(CACHE_KEYS.adminUnits);
      invalidateCached(CACHE_KEYS.countries);
      setData((current) => current && { ...current, detail: { ...current.detail, run } });
      return run;
    } finally {
      setPromoting(false);
    }
  }, [id, setData]);

  const detail: ImportRunDetail | null = data && data.detail.run.id === id ? data.detail : null;
  const meta: PaginationMeta = data?.meta ?? {};
  return {
    run: detail?.run ?? null,
    rows: detail?.rows ?? ([] as StagingRow[]),
    meta,
    ...paginationDetails(meta),
    ...state,
    notFound: state.errorStatus === 404 || state.errorStatus === 400,
    promote,
    promoting,
  };
}
