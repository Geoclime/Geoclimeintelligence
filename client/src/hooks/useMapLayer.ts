import { useEffect, useRef, useState } from "react";
import { fetchLayerGeoJson } from "../endpoints/map-layer.endpoints";
import { errorMessage } from "../transport/api-error";
import type { BBox } from "../types/admin-unit.types";
import type { OverlayCollections, OverlayLayerId } from "../types/map-layer.types";
import { useDebounce } from "./useDebounce";

interface LayerOptions {
  /** false = the layer is switched off: nothing is fetched and nothing is returned. */
  enabled?: boolean;
  /** Lets the server thin the layer and simplify shapes for this zoom. Rounded so tiny zooms don't refetch. */
  zoom?: number;
  /** Change it to fetch the same view again, e.g. after a place was saved. */
  refreshKey?: number;
}

/**
 * One feature layer (roads, waterways or settlements), only inside the visible area (standard
 * section 10). Same lifecycle as useAdminUnitLayer: it waits 300 ms after the map stops moving,
 * then fetches that bbox, and replies for an older view are dropped. Never cached: a bbox key
 * would almost never repeat (standard section 14).
 */
export function useMapLayer<L extends OverlayLayerId>(layer: L, bbox: BBox | null, { enabled = true, zoom, refreshKey = 0 }: LayerOptions = {}) {
  const roundedZoom = zoom === undefined ? undefined : Math.round(zoom);
  const view = useDebounce(enabled && bbox ? { bbox, zoom: roundedZoom } : null, 300);
  const [data, setData] = useState<OverlayCollections[L] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const viewKey = view ? `${view.bbox.join(",")}|${view.zoom ?? ""}` : null;

  useEffect(() => {
    if (!view) return;
    const thisRequest = ++requestId.current;
    // Starting a request is the one synchronous state change here; the rest happen on reply.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetchLayerGeoJson(layer, { bbox: view.bbox, zoom: view.zoom })
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
