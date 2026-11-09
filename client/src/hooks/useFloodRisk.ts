import { QUERY_KEYS, REFERENCE_POLICY } from "../cache/queryClient";
import { fetchFloodRiskImage, fetchFloodRiskLayer } from "../endpoints/flood-risk.endpoints";
import type { FloodRiskLayer } from "../types/flood-risk.types";
import { useLoader } from "./useLoader";

/** The picture as a data URL: Mapbox can take it as an image source, and unlike an object URL there is nothing to revoke. */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("The map picture couldn't be read."));
    reader.readAsDataURL(blob);
  });
}

/**
 * One flood risk map's picture, ready for the map. It is fetched through the API (so it needs the
 * sign-in token, which a map's own image request can't send) and remembered: a layer's picture never
 * changes once imported, so nothing is asked again while it is fresh.
 */
export function useFloodRiskImage(layerId: string | undefined) {
  const key = layerId ? [...QUERY_KEYS.floodRisk, "image", layerId] : null;
  const { data, loading, error } = useLoader<string>(key, async () => blobToDataUrl(await fetchFloodRiskImage(layerId!)), REFERENCE_POLICY);
  return { imageUrl: data, loading, error };
}

/**
 * The country's live flood risk map for the home map: its description (legend colours, areas,
 * source, corners) and its picture. `layer` is null until one has been promoted, so the screen
 * shows no toggle for a map that doesn't exist. Cached; a promoted import clears it.
 */
export function useFloodRisk(countryCode: string | null) {
  const key = countryCode ? [...QUERY_KEYS.floodRisk, "layer", countryCode] : null;
  const { data, loading: layerLoading, error: layerError } = useLoader<FloodRiskLayer | null>(
    key,
    async () => (await fetchFloodRiskLayer(countryCode!)).data ?? null,
    REFERENCE_POLICY,
  );
  const image = useFloodRiskImage(data?.id);
  return {
    layer: data,
    imageUrl: image.imageUrl,
    loading: layerLoading || image.loading,
    error: layerError ?? image.error,
  };
}
