import { ALERTS_POLICY, QUERY_KEYS } from "../cache/queryClient";
import { fetchDrainageSummary } from "../endpoints/field-survey.endpoints";
import type { DrainageSummary } from "../types/field-survey.types";
import { useLoader } from "./useLoader";

/**
 * The drainage responders have recorded in an LGA or ward, with totals by condition. Like the flood history
 * it lives under the alerts key on purpose: recording, re-inspecting or deleting a drain sends the same live
 * "alerts changed" signal (components/layout/LiveUpdates.tsx), so an open place page brings it up to date
 * without a refresh, and it is remembered only briefly, since a blocked drain is exactly what mustn't be stale.
 */
export function useDrainageSummary(areaId: string | undefined) {
  const key = areaId ? [...QUERY_KEYS.alerts, "drainage-summary", areaId] : null;
  const { data, ...state } = useLoader<DrainageSummary>(
    key,
    async () => {
      const response = await fetchDrainageSummary(areaId!);
      if (!response.data) throw new Error(response.message || "The server returned no drainage.");
      return response.data;
    },
    ALERTS_POLICY,
  );
  return { summary: data, ...state };
}
