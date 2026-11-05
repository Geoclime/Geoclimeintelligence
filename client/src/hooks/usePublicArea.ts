import { QUERY_KEYS, REFERENCE_POLICY } from "../cache/queryClient";
import { fetchPublicArea } from "../endpoints/public.endpoints";
import type { PublicArea } from "../types/public.types";
import { useLoader } from "./useLoader";

/** One area, the areas above it and its rainfall, for the place finder's summary. No sign-in needed. */
export function usePublicArea(id: string | null) {
  const key = id ? [...QUERY_KEYS.public, "area", id] : null;
  const { data, ...state } = useLoader<PublicArea>(
    key,
    async () => {
      const response = await fetchPublicArea(id!);
      if (!response.data) throw new Error(response.message || "The server returned no area.");
      return response.data;
    },
    REFERENCE_POLICY,
  );
  return { area: data, ...state };
}
