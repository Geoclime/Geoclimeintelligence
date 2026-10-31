import { useCallback, useMemo, useState } from "react";
import type { BBox } from "../types/admin-unit.types";
import type { FloodExtentFeatureCollection, SelectedSurvey } from "../types/field-survey.types";
import { useRealtimeEvent } from "./useRealtimeEvent";
import { useSurveyLayers } from "./useSurveyLayers";

type SelectedFlood = Extract<SelectedSurvey, { type: "flood" }>;

/**
 * The floods to draw on a place's own map (an LGA's or a ward's), and the one the visitor clicked. They are
 * the same floods the main map shows (still going, or receded in the last week), narrowed to those filed
 * under this place, so the map agrees with the flood history beside it and a flood in the next LGA or ward
 * isn't drawn here. A flood
 * recorded, called over or deleted elsewhere is picked up at once, over the live connection.
 */
export function useAreaFloods(areaId: string | undefined, bbox: BBox | null) {
  const [refresh, setRefresh] = useState(0);
  const [selected, setSelected] = useState<SelectedFlood | null>(null);
  const { floodExtents } = useSurveyLayers(bbox, { floodExtents: Boolean(areaId), drainage: false }, refresh);
  useRealtimeEvent("alerts:changed", () => setRefresh((count) => count + 1));

  const floods = useMemo<FloodExtentFeatureCollection | null>(() => {
    const data = floodExtents.data;
    return data ? { ...data, features: data.features.filter((feature) => feature.properties.lgaId === areaId || feature.properties.wardId === areaId) } : null;
  }, [floodExtents.data, areaId]);

  return { floods, selected, select: setSelected, close: useCallback(() => setSelected(null), []) };
}
