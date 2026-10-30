import { CACHE_KEYS, cached } from "../cache/localCache";
import { fetchPublicOverview } from "../endpoints/public.endpoints";
import type { PublicOverview } from "../types/public.types";
import { useLoader } from "./useLoader";

const KEY = `${CACHE_KEYS.public}overview`;

/** The landing page's counters and data credits. No sign-in needed; cached like other reference data. */
export function usePublicOverview() {
  const { data, ...state } = useLoader<PublicOverview>(KEY, () =>
    cached(KEY, async () => {
      const response = await fetchPublicOverview();
      if (!response.data) throw new Error(response.message || "The server returned no overview.");
      return response.data;
    }),
  );
  return { overview: data, ...state };
}
