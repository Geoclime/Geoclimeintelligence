import type { FeatureCollection } from "geojson";
import { memo, useMemo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type {
  RoadFeatureCollection,
  SettlementFeatureCollection,
  WaterwayFeatureCollection,
} from "../../types/map-layer.types";
import { overlayLayers, type MapPalette } from "./map-style";

interface MapOverlayLayersProps {
  palette: MapPalette;
  roads: RoadFeatureCollection | null;
  waterways: WaterwayFeatureCollection | null;
  settlements: SettlementFeatureCollection | null;
}

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Waterways, roads and settlements as native Mapbox sources and layers (standard section 10:
 * never React markers for a whole layer), drawn bottom to top in that order and under the
 * boundary lines.
 *
 * Unlike the boundary layers, every source is always mounted, empty until its data arrives or
 * while its layer is switched off. That keeps the draw order fixed: Mapbox stacks layers in the
 * order they were added, so a source that only mounted when its data landed would jump above
 * ones that landed earlier. An empty source draws nothing, so nothing is drawn from placeholder
 * data.
 */
export const MapOverlayLayers = memo(function MapOverlayLayers({ palette, roads, waterways, settlements }: MapOverlayLayersProps) {
  const layers = useMemo(() => overlayLayers(palette), [palette]);

  return (
    <>
      <Source id="waterways" type="geojson" data={waterways ?? EMPTY}>
        <Layer {...layers.waterFill} />
        <Layer {...layers.waterLine} />
      </Source>
      <Source id="roads" type="geojson" data={roads ?? EMPTY}>
        <Layer {...layers.roadLocal} />
        <Layer {...layers.roadSecondary} />
        <Layer {...layers.roadMajor} />
        <Layer {...layers.roadLabels} />
      </Source>
      <Source id="settlements" type="geojson" data={settlements ?? EMPTY}>
        <Layer {...layers.settlementDots} />
        <Layer {...layers.settlementLabels} />
      </Source>
    </>
  );
});
