import { CACHE_KEYS, cached } from "../cache/localCache";
import { fetchAdminUnit } from "../endpoints/admin-unit.endpoints";
import type { AdminUnitDetail } from "../types/admin-unit.types";
import { useLoader } from "./useLoader";

/** One area in full: parent, source and shape. `id` undefined = nothing to load yet. */
export function useAdminUnit(id: string | undefined) {
  const key = id ? `${CACHE_KEYS.adminUnits}detail:${id}` : null;
  const { data, ...state } = useLoader<AdminUnitDetail>(key, () =>
    cached(key!, async () => {
      const response = await fetchAdminUnit(id!);
      if (!response.data) throw new Error(response.message || "The server returned no area.");
      return response.data;
    }),
  );
  // While a new id loads, don't show the previous area's details under the new URL.
  const unit = data && data.id === id ? data : null;
  return { unit, ...state, notFound: state.errorStatus === 404 || state.errorStatus === 400 };
}
