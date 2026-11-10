import { searchHouseholds } from "../endpoints/household.endpoints";
import type { HouseholdHit } from "../types/household.types";
import { useLoader } from "./useLoader";
import { MIN_SEARCH_LENGTH } from "./usePublicSearch";

/**
 * Households matching `q`, for the top bar's search: the viewer's own, or everyone's for staff (the server
 * decides). Pass an already-debounced value; nothing is requested below MIN_SEARCH_LENGTH characters. Not
 * cached: every search is different, and households are private.
 */
export function useHouseholdSearch(q: string) {
  const key = q.length >= MIN_SEARCH_LENGTH ? ["household-search", q.toLowerCase()] : null;
  const { data, ...state } = useLoader<HouseholdHit[]>(key, async () => {
    const response = await searchHouseholds(q);
    if (!response.data) throw new Error(response.message || "The server returned no results.");
    return response.data;
  });
  return { households: key ? (data ?? []) : [], ...state };
}
