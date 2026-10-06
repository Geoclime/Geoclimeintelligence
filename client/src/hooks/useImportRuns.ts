import { fetchImportRuns } from "../endpoints/import.endpoints";
import type { PaginationMeta } from "../types/api.types";
import type { ImportRun } from "../types/import.types";
import { paginationDetails } from "../utils/pagination";
import { useLoader } from "./useLoader";

/** The import history, newest first: who ran each import, when, row counts and status. */
export function useImportRuns(page = 1, pageSize = 25) {
  const { data, ...state } = useLoader(`import-runs:${page}:${pageSize}`, async () => {
    const response = await fetchImportRuns({ page, pageSize });
    return { items: response.data ?? [], meta: response.meta ?? {} };
  });
  const meta: PaginationMeta = data?.meta ?? {};
  return { runs: data?.items ?? ([] as ImportRun[]), meta, ...paginationDetails(meta), ...state };
}
