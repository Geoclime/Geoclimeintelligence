import { BUILDING_MIN_ZOOM, WARD_MIN_ZOOM, type MapLayerId } from "../components/map/map-style";
import type { BBox } from "../types/admin-unit.types";
import { useAdminUnitLayer } from "./useAdminUnitLayer";
import { useMapLayer } from "./useMapLayer";

/**
 * Everything the platform's map draws for the visible area: the state, LGA and ward boundaries, and
 * the roads, waterways, settlements, facilities and buildings over them. Each layer is fetched
 * only while its switch is on, and wards and buildings only from the zoom where they are drawn.
 * Used by the main map and by the map under a flood report, so both show the same things.
 */
export function useMapLayers(bbox: BBox | null, zoom: number, on: Record<MapLayerId, boolean>) {
  const state = useAdminUnitLayer(bbox, 1, { enabled: on.state, zoom });
  const lga = useAdminUnitLayer(bbox, 2, { enabled: on.lga, zoom });
  const ward = useAdminUnitLayer(bbox, 3, { enabled: on.ward && zoom >= WARD_MIN_ZOOM, zoom });
  const roads = useMapLayer("roads", bbox, { enabled: on.roads, zoom });
  const waterways = useMapLayer("waterways", bbox, { enabled: on.waterways, zoom });
  const settlements = useMapLayer("settlements", bbox, { enabled: on.settlements, zoom });
  const infrastructure = useMapLayer("infrastructure", bbox, { enabled: on.infrastructure, zoom });
  const buildings = useMapLayer("buildings", bbox, { enabled: on.buildings && zoom >= BUILDING_MIN_ZOOM, zoom });

  const all = [state, lga, ward, roads, waterways, settlements, infrastructure, buildings];
  return {
    state,
    lga,
    ward,
    roads,
    waterways,
    settlements,
    infrastructure,
    buildings,
    loading: all.some((layer) => layer.loading),
    /** The first layer that failed, if any. */
    error: all.find((layer) => layer.error)?.error ?? null,
  };
}
