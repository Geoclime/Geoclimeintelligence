import { CACHE_KEYS, cached } from "../cache/localCache";
import { fetchAdminUnits } from "../endpoints/admin-unit.endpoints";
import type { PaginationMeta } from "../types/api.types";
import type { AdminUnitListParams, AdminUnitSummary } from "../types/admin-unit.types";
import { paginationDetails } from "../utils/pagination";
import { useLoader } from "./useLoader";

interface UseAdminUnitsOptions {
  level?: number;
  parentId?: string;
  countryCode?: string;
  /** Already debounced by the caller (standard section 7). */
  q?: string;
  page?: number;
  pageSize?: number;
  /** false = not yet (e.g. waiting for the country code): nothing is requested. */
  enabled?: boolean;
}

/**
 * One page of areas (names, codes, child counts; never shapes), e.g. the LGA directory. Reference
 * data, so each page is cached for 15 minutes and dropped when an import is promoted.
 */
export function useAdminUnits({ level, parentId, countryCode, q, page = 1, pageSize = 100, enabled = true }: UseAdminUnitsOptions) {
  const params: AdminUnitListParams = { level, parentId, countryCode, q: q || undefined, page, pageSize };
  const key = `${CACHE_KEYS.adminUnits}list:${JSON.stringify(params)}`;

  const { data, ...state } = useLoader(enabled ? key : null, () =>
    cached(key, async () => {
      const response = await fetchAdminUnits(params);
      return { items: response.data ?? [], meta: response.meta ?? {} };
    }),
  );

  const meta: PaginationMeta = data?.meta ?? {};
  return { units: data?.items ?? ([] as AdminUnitSummary[]), meta, ...paginationDetails(meta), ...state };
}
