import { useCallback, useMemo, useState } from "react";
import type { BBox } from "../types/admin-unit.types";
import type { DrainageFeatureCollection, FloodExtentFeatureCollection, SelectedSurvey } from "../types/field-survey.types";
import { useRealtimeEvent } from "./useRealtimeEvent";
import { useSurveyLayers } from "./useSurveyLayers";

/**
 * The floods and drains to draw on a place's own map (an LGA's or a ward's), and the one the visitor clicked.
 * They are the same ones the main map shows (floods still going or receded in the last week, every drain),
 * narrowed to those filed under this place, so the map agrees with the flood history and drainage beside it
 * and a flood or drain in the next LGA or ward isn't drawn here. One recorded, changed or deleted elsewhere
 * is picked up at once, over the live connection.
 */
export function useAreaSurvey(areaId: string | undefined, bbox: BBox | null) {
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<SelectedSurvey | null>(null);
  const { floodExtents, drainage } = useSurveyLayers(bbox, { floodExtents: Boolean(areaId), drainage: Boolean(areaId) }, refresh);
  useRealtimeEvent("alerts:changed", () => setRefresh((count) => count + 1));

  const own = (properties: { lgaId: string | null; wardId: string | null }) => properties.lgaId === areaId || properties.wardId === areaId;
  const floods = useMemo<FloodExtentFeatureCollection | null>(() => {
    const data = floodExtents.data;
    return data ? { ...data, features: data.features.filter((feature) => own(feature.properties)) } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floodExtents.data, areaId]);
  const drains = useMemo<DrainageFeatureCollection | null>(() => {
    const data = drainage.data;
    return data ? { ...data, features: data.features.filter((feature) => own(feature.properties)) } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drainage.data, areaId]);

  return { floods, drains, selected, select: setSelected, close: useCallback(() => setSelected(null), []) };
}
