import { CACHE_KEYS, cached } from "../cache/localCache";
import { fetchRainfallSeries } from "../endpoints/rainfall.endpoints";
import type { RainfallSeries } from "../types/rainfall.types";
import { useLoader } from "./useLoader";

/** One area's whole monthly rainfall series. Cached; a promoted rainfall import clears it. */
export function useRainfall(adminUnitId: string | undefined) {
  const key = adminUnitId ? `${CACHE_KEYS.rainfall}${adminUnitId}` : null;
  const { data, ...state } = useLoader<RainfallSeries>(key, () =>
    cached(key!, async () => {
      const response = await fetchRainfallSeries(adminUnitId!);
      if (!response.data) throw new Error(response.message || "The server returned no rainfall.");
      return response.data;
    }),
  );
  return { series: data, ...state };
}
