import { fetchImportRunGeoJson } from "../endpoints/import.endpoints";
import type { BBox } from "../types/admin-unit.types";
import type { StagingFeatureCollection } from "../types/import.types";
import { useDebounce } from "./useDebounce";
import { useLoader } from "./useLoader";

/**
 * The staged shapes of one import for the review map, passed and failed, inside the visible area
 * (bbox-scoped like every map layer, standard section 10). `version` changes after a promote so the
 * colours refresh.
 */
export function useImportRunLayer(id: string | undefined, bbox: BBox | null, version = 0) {
  const view = useDebounce(bbox, 300);
  const key = id && view ? `import-layer:${id}:${view.join(",")}:${version}` : null;
  const { data, loading, error } = useLoader<StagingFeatureCollection>(key, async () => {
    const response = await fetchImportRunGeoJson(id!, view!);
    return response.data ?? { type: "FeatureCollection", features: [] };
  });
  return { data, loading, error };
}
