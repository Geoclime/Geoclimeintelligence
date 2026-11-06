import { QUERY_KEYS, REFERENCE_POLICY } from "../cache/queryClient";
import { fetchRunSatelliteFlood, fetchSatelliteFloodImage, fetchSatelliteFloods } from "../endpoints/satellite-flood.endpoints";
import type { SatelliteFloodLayer, SatelliteFloodList } from "../types/satellite-flood.types";
import { blobToDataUrl } from "./useFloodRisk";
import { useLoader } from "./useLoader";

/**
 * One month's picture, ready for the map. Fetched through the API (it needs the sign-in token, which
 * a map's own image request can't send) and remembered: a month's picture never changes once imported.
 */
export function useSatelliteFloodImage(layerId: string | undefined) {
  const key = layerId ? [...QUERY_KEYS.satelliteFlood, "image", layerId] : null;
  const { data, loading, error } = useLoader<string>(key, async () => blobToDataUrl(await fetchSatelliteFloodImage(layerId!)), REFERENCE_POLICY);
  return { imageUrl: data, loading, error };
}

/**
 * The country's live months of satellite flood extent for the home map, and the picture of the one
 * chosen (`yearMonth`, or the latest when it isn't given or isn't live). `months` is empty until one
 * has been promoted, so the screen shows no toggle for data that doesn't exist. Only the chosen
 * month's picture is fetched, and only while `withImage` (the layer is switched on).
 */
export function useSatelliteFlood(countryCode: string | null, yearMonth: string | null, withImage = true) {
  const key = countryCode ? [...QUERY_KEYS.satelliteFlood, "list", countryCode] : null;
  const { data, loading: listLoading, error: listError } = useLoader<SatelliteFloodList>(
    key,
    async () => {
      const response = await fetchSatelliteFloods(countryCode!);
      return response.data ?? { countryCode: countryCode!, months: [] };
    },
    REFERENCE_POLICY,
  );
  const months = data?.months ?? [];
  const layer = months.find((m) => m.yearMonth === yearMonth) ?? months[0] ?? null;
  const image = useSatelliteFloodImage(withImage ? layer?.id : undefined);
  return {
    months,
    layer,
    imageUrl: image.imageUrl,
    loading: listLoading || image.loading,
    error: listError ?? image.error,
  };
}

/**
 * The month a satellite flood import staged, for its review screen. `enabled` is false for any
 * other kind of run. Not cached: the answer is about one run, which is promoted from this very screen.
 */
export function useRunSatelliteFlood(runId: string | undefined, enabled: boolean) {
  const key = runId && enabled ? ["satellite-flood-run", runId] : null;
  const { data, loading, error } = useLoader<SatelliteFloodLayer>(key, async () => {
    const response = await fetchRunSatelliteFlood(runId!);
    if (!response.data) throw new Error(response.message || "The server returned no satellite flood month for this import.");
    return response.data;
  });
  const image = useSatelliteFloodImage(data?.id);
  return { layer: data, imageUrl: image.imageUrl, loading: loading || image.loading, error: error ?? image.error };
}
