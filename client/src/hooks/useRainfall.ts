import { QUERY_KEYS, REFERENCE_POLICY } from "../cache/queryClient";
import { fetchRainfallSeries } from "../endpoints/rainfall.endpoints";
import type { RainfallSeries } from "../types/rainfall.types";
import { useLoader } from "./useLoader";

/** One area's whole monthly rainfall series. Cached; a promoted rainfall import clears it. */
export function useRainfall(adminUnitId: string | undefined) {
  const key = adminUnitId ? [...QUERY_KEYS.rainfall, adminUnitId] : null;
  const { data, ...state } = useLoader<RainfallSeries>(
    key,
    async () => {
      const response = await fetchRainfallSeries(adminUnitId!);
      if (!response.data) throw new Error(response.message || "The server returned no rainfall.");
      return response.data;
    },
    REFERENCE_POLICY,
  );
  return { series: data, ...state };
}
