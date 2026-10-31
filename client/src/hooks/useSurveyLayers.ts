import { useEffect, useRef, useState } from "react";
import { fetchSurveyGeoJson, type SurveyCollections, type SurveyLayerPath } from "../endpoints/field-survey.endpoints";
import { errorMessage } from "../transport/api-error";
import type { BBox } from "../types/admin-unit.types";
import { useDebounce } from "./useDebounce";

interface SurveyLayerOptions {
  /** false = the layer is switched off: nothing is fetched and nothing is returned. */
  enabled: boolean;
  /** Change it to fetch the same view again, e.g. after a flood or drain was saved. */
  refreshKey: number;
}

/**
 * One survey layer (recorded floods, or drains) for the visible area. Same lifecycle as useMapLayer: it
 * waits 300 ms after the map stops moving, fetches that bbox, and drops replies for an older view. Never
 * cached: a bbox key would almost never repeat, and a flood is exactly what must not be stale.
 */
function useSurveyLayer<L extends SurveyLayerPath>(layer: L, bbox: BBox | null, { enabled, refreshKey }: SurveyLayerOptions) {
  const view = useDebounce(enabled && bbox ? { bbox } : null, 300);
  const [data, setData] = useState<SurveyCollections[L] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const viewKey = view ? view.bbox.join(",") : null;

  useEffect(() => {
    if (!view) return;
    const thisRequest = ++requestId.current;
    // Starting a request is the one synchronous state change here; the rest happen on reply.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchSurveyGeoJson(layer, { bbox: view.bbox })
      .then(
        (response) => {
          if (thisRequest !== requestId.current) return;
          setData(response.data);
          setError(null);
        },
        (err: unknown) => {
          if (thisRequest === requestId.current) setError(errorMessage(err));
        },
      )
      .finally(() => {
        if (thisRequest === requestId.current) setLoading(false);
      });
    // viewKey stands in for `view`, whose identity changes on every debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, layer, refreshKey]);

  return { data: enabled ? data : null, loading: enabled && loading, error: enabled ? error : null };
}

/** The recorded floods and drains for the visible area, each only while its switch is on. */
export function useSurveyLayers(bbox: BBox | null, on: { floodExtents: boolean; drainage: boolean }, refreshKey: number) {
  const floodExtents = useSurveyLayer("flood-extents", bbox, { enabled: on.floodExtents, refreshKey });
  const drainage = useSurveyLayer("drainage", bbox, { enabled: on.drainage, refreshKey });
  return { floodExtents, drainage };
}
