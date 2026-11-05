import { searchFacilities } from "../endpoints/map-layer.endpoints";
import type { FacilityHit } from "../types/map-layer.types";
import { useLoader } from "./useLoader";
import { MIN_SEARCH_LENGTH } from "./usePublicSearch";

/**
 * Facilities whose name contains `q`, for the top bar's search. Pass an already-debounced value;
 * nothing is requested below MIN_SEARCH_LENGTH characters. Not cached: every search is different.
 */
export function useFacilitySearch(q: string) {
  const key = q.length >= MIN_SEARCH_LENGTH ? ["facility-search", q.toLowerCase()] : null;
  const { data, ...state } = useLoader<FacilityHit[]>(key, async () => {
    const response = await searchFacilities(q);
    if (!response.data) throw new Error(response.message || "The server returned no results.");
    return response.data;
  });
  return { facilities: key ? (data ?? []) : [], ...state };
}
