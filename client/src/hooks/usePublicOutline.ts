import { QUERY_KEYS, REFERENCE_POLICY } from "../cache/queryClient";
import { fetchPublicOutline } from "../endpoints/public.endpoints";
import type { PublicOutline } from "../types/public.types";
import { useLoader } from "./useLoader";

const KEY = [...QUERY_KEYS.public, "outline"];

/** The simplified LGA shapes behind the landing page's drawing of the state. No sign-in needed. */
export function usePublicOutline() {
  const { data, ...state } = useLoader<PublicOutline>(
    KEY,
    async () => {
      const response = await fetchPublicOutline();
      if (!response.data) throw new Error(response.message || "The server returned no outline.");
      return response.data;
    },
    REFERENCE_POLICY,
  );
  return { outline: data, ...state };
}
