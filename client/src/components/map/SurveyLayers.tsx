import type { FeatureCollection } from "geojson";
import { memo, useMemo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { DrainageFeatureCollection, FloodExtentFeatureCollection, SurveyTarget } from "../../types/field-survey.types";
import type { LonLat } from "../../types/admin-unit.types";
import { surveyDraftGeoJson } from "../../utils/survey-draft-geojson";
import type { MapPalette } from "./map-style";
import { draftLayers, surveyLayers } from "./survey-style";

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

interface SurveyLayersProps {
  palette: MapPalette;
  floods: FloodExtentFeatureCollection | null;
  drains: DrainageFeatureCollection | null;
}

/**
 * The floods and drains responders recorded. Like the facility layers, both sources are always
 * mounted (empty until their data arrives, or while switched off), so the draw order never changes:
 * drains over floods, both over the other overlays and under the boundary lines.
 */
export const SurveyLayers = memo(function SurveyLayers({ palette, floods, drains }: SurveyLayersProps) {
  const layers = useMemo(() => surveyLayers(palette), [palette]);
  return (
    <>
      <Source id="flood-extents" type="geojson" data={floods ?? EMPTY}>
        <Layer {...layers.floodFill} />
        <Layer {...layers.floodLine} />
        <Layer {...layers.floodRecededLine} />
      </Source>
      <Source id="drainage" type="geojson" data={drains ?? EMPTY}>
        <Layer {...layers.drainHit} />
        <Layer {...layers.drainLine} />
        <Layer {...layers.drainPoints} />
      </Source>
    </>
  );
});

interface SurveyDraftLayerProps {
  palette: MapPalette;
  target: SurveyTarget | null;
  points: readonly LonLat[];
  /** Where the device is now, shown while walking. */
  me: LonLat | null;
}

/** The walk in progress, over everything else: its ring or path, a dot for each point, and where you stand. */
export function SurveyDraftLayer({ palette, target, points, me }: SurveyDraftLayerProps) {
  const layers = useMemo(() => draftLayers(palette), [palette]);
  const data = useMemo(() => surveyDraftGeoJson(target, points, me), [target, points, me]);
  return (
    <Source id="survey-draft" type="geojson" data={data}>
      <Layer {...layers.draftFill} />
      <Layer {...layers.draftOutline} />
      <Layer {...layers.draftVertices} />
      <Layer {...layers.draftMe} />
    </Source>
  );
}
