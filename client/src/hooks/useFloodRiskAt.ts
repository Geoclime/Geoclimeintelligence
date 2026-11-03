import { fetchFloodRiskAt } from "../endpoints/flood-risk.endpoints";
import type { LonLat } from "../types/admin-unit.types";
import type { FloodRiskPoint } from "../types/flood-risk.types";
import { useLoader } from "./useLoader";

/**
 * The flood risk class under a clicked point, for the map's popup. Asked only while the layer is
 * switched on and a point is chosen. Not cached: each click is a new point. `null` means no live
 * map; a point outside the map's data comes back with `class: null`.
 */
export function useFloodRiskAt(countryCode: string | null, point: LonLat | null, enabled: boolean) {
  const key = enabled && countryCode && point ? ["flood-risk-at", countryCode, point[0], point[1]] : null;
  const { data, loading, error } = useLoader<FloodRiskPoint | null>(key, async () => (await fetchFloodRiskAt(point![0], point![1], countryCode!)).data ?? null);
  return { risk: data, loading, error };
}
