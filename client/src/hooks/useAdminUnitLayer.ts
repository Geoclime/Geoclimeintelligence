import { useEffect, useRef, useState } from "react";
import { fetchAdminUnitsGeoJson } from "../endpoints/admin-unit.endpoints";
import { errorMessage } from "../transport/api-error";
import type { AdminUnitFeatureCollection, BBox } from "../types/admin-unit.types";
import { useDebounce } from "./useDebounce";

interface LayerOptions {
  /** false = the layer is switched off or not needed at this zoom: nothing is fetched. */
  enabled?: boolean;
  /** Lets the server simplify shapes to about one screen pixel. Rounded so tiny zooms don't refetch. */
  zoom?: number;
  parentId?: string;
}

/**
 * The shapes for one level of the map, only inside the visible area (standard section 10). It
 * waits 300 ms after the map stops moving, then fetches that bbox. Responses for an older view
 * are dropped. Never cached: a bbox key would almost never repeat (standard section 14).
 */
export function useAdminUnitLayer(bbox: BBox | null, level: number, { enabled = true, zoom, parentId }: LayerOptions = {}) {
  const roundedZoom = zoom === undefined ? undefined : Math.round(zoom);
  const view = useDebounce(enabled && bbox ? { bbox, zoom: roundedZoom } : null, 300);
  const [data, setData] = useState<AdminUnitFeatureCollection | null>(null);
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
    fetchAdminUnitsGeoJson({ level, bbox: view.bbox, zoom: view.zoom, parentId })
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
  }, [viewKey, level, parentId]);

  return { data: enabled ? data : null, loading: enabled && loading, error: enabled ? error : null };
}
