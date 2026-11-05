import { ALERTS_POLICY, QUERY_KEYS } from "../cache/queryClient";
import { fetchFloodHistory } from "../endpoints/field-survey.endpoints";
import type { FloodHistory } from "../types/field-survey.types";
import { useLoader } from "./useLoader";

/**
 * The floods responders have recorded in an LGA or ward, with totals. It lives under the alerts key
 * on purpose: recording, receding or deleting a flood sends the same live "alerts changed" signal as an
 * alert does (components/layout/LiveUpdates.tsx), so an open place page brings its history up to date
 * without a refresh, and it is remembered only briefly, since a flood is exactly what mustn't be stale.
 */
export function useFloodHistory(areaId: string | undefined) {
  const key = areaId ? [...QUERY_KEYS.alerts, "flood-history", areaId] : null;
  const { data, ...state } = useLoader<FloodHistory>(
    key,
    async () => {
      const response = await fetchFloodHistory(areaId!);
      if (!response.data) throw new Error(response.message || "The server returned no flood history.");
      return response.data;
    },
    ALERTS_POLICY,
  );
  return { history: data, ...state };
}
