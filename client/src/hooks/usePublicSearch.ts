import { searchPublicPlaces } from "../endpoints/public.endpoints";
import type { PublicSearchResults } from "../types/public.types";
import { useLoader } from "./useLoader";

/** The shortest search the server accepts. */
export const MIN_SEARCH_LENGTH = 2;

/**
 * Areas and communities whose names contain `q`, for the landing page's place finder. Pass an
 * already-debounced value; nothing is requested below MIN_SEARCH_LENGTH characters. Not cached:
 * every search is different, and the server's reply may be reused by the browser for a minute.
 */
export function usePublicSearch(q: string) {
  const key = q.length >= MIN_SEARCH_LENGTH ? `public-search:${q.toLowerCase()}` : null;
  const { data, ...state } = useLoader<PublicSearchResults>(key, async () => {
    const response = await searchPublicPlaces(q);
    if (!response.data) throw new Error(response.message || "The server returned no results.");
    return response.data;
  });
  return { results: key ? data : null, ...state };
}
