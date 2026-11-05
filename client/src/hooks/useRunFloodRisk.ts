import { fetchRunFloodRisk } from "../endpoints/flood-risk.endpoints";
import type { FloodRiskLayer } from "../types/flood-risk.types";
import { useFloodRiskImage } from "./useFloodRisk";
import { useLoader } from "./useLoader";

/**
 * The map a flood risk import staged, for its review screen: where it sits and what it looks like,
 * before anything is live. `enabled` is false for any other kind of run. Not cached: the answer is
 * about one run, which is promoted from this very screen.
 */
export function useRunFloodRisk(runId: string | undefined, enabled: boolean) {
  const key = runId && enabled ? ["flood-risk-run", runId] : null;
  const { data, loading, error } = useLoader<FloodRiskLayer>(key, async () => {
    const response = await fetchRunFloodRisk(runId!);
    if (!response.data) throw new Error(response.message || "The server returned no flood risk map for this import.");
    return response.data;
  });
  const image = useFloodRiskImage(data?.id);
  return { layer: data, imageUrl: image.imageUrl, loading: loading || image.loading, error: error ?? image.error };
}
