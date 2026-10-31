import { QUERY_KEYS, REFERENCE_POLICY } from "../cache/queryClient";
import { fetchPublicOverview } from "../endpoints/public.endpoints";
import type { PublicOverview } from "../types/public.types";
import { useLoader } from "./useLoader";

const KEY = [...QUERY_KEYS.public, "overview"];

/** The landing page's counters and data credits. No sign-in needed; cached like other reference data. */
export function usePublicOverview() {
  const { data, ...state } = useLoader<PublicOverview>(
    KEY,
    async () => {
      const response = await fetchPublicOverview();
      if (!response.data) throw new Error(response.message || "The server returned no overview.");
      return response.data;
    },
    REFERENCE_POLICY,
  );
  return { overview: data, ...state };
}
