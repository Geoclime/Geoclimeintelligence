import { CACHE_KEYS, cached } from "../cache/localCache";
import { fetchAdminUnitChildren } from "../endpoints/admin-unit.endpoints";
import type { PaginationMeta } from "../types/api.types";
import type { AdminUnitSummary } from "../types/admin-unit.types";
import { paginationDetails } from "../utils/pagination";
import { useLoader } from "./useLoader";

/** The areas directly under one area: an LGA's wards, or the state's LGAs. No shapes. */
export function useAdminUnitChildren(id: string | undefined, page = 1, pageSize = 100) {
  const key = id ? `${CACHE_KEYS.adminUnits}children:${id}:${page}:${pageSize}` : null;
  const { data, ...state } = useLoader(key, () =>
    cached(key!, async () => {
      const response = await fetchAdminUnitChildren(id!, { page, pageSize });
      return { items: response.data ?? [], meta: response.meta ?? {} };
    }),
  );
  const meta: PaginationMeta = data?.meta ?? {};
  return { children: data?.items ?? ([] as AdminUnitSummary[]), meta, ...paginationDetails(meta), ...state };
}
