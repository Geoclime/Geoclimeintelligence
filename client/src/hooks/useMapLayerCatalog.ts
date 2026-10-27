import { CACHE_KEYS, cached } from "../cache/localCache";
import { fetchMapLayers } from "../endpoints/map-layer.endpoints";
import type { MapLayerInfo } from "../types/map-layer.types";
import { useLoader } from "./useLoader";

/**
 * Each feature layer with how much of it is loaded and which data sources it came from. Cached:
 * it only changes when an administrator runs the loader.
 */
export function useMapLayerCatalog() {
  const key = `${CACHE_KEYS.mapLayers}list`;
  const { data, ...state } = useLoader(key, () => cached(key, async () => (await fetchMapLayers()).data ?? []));
  return { catalog: data ?? ([] as MapLayerInfo[]), ...state };
}
