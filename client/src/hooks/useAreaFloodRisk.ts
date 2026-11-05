import { QUERY_KEYS, REFERENCE_POLICY } from "../cache/queryClient";
import { fetchAreaFloodRisk } from "../endpoints/flood-risk.endpoints";
import type { AreaFloodRisk } from "../types/flood-risk.types";
import { useLoader } from "./useLoader";

/**
 * How at risk one LGA or ward is, from the live flood risk map. `risk` is null when there is no live
 * map or the area wasn't measured, so a profile shows nothing rather than an empty card. Cached; a
 * promoted import clears it.
 */
export function useAreaFloodRisk(adminUnitId: string | undefined) {
  const key = adminUnitId ? [...QUERY_KEYS.floodRisk, "area", adminUnitId] : null;
  const { data, loading, error } = useLoader<AreaFloodRisk | null>(key, async () => (await fetchAreaFloodRisk(adminUnitId!)).data ?? null, REFERENCE_POLICY);
  return { risk: data, loading, error };
}
