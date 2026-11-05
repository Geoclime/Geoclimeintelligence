import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { ResolvedTheme } from "../../contexts/ThemeContext";
import type { BBox } from "../../types/admin-unit.types";
import type { FloodRiskLayer as FloodRiskMap } from "../../types/flood-risk.types";
import type { StagingFeatureCollection } from "../../types/import.types";
import { floodRiskLegend } from "../../utils/flood-risk";
import { ClimateMap, type MapView } from "../map/ClimateMap";
import { FloodRiskLayer } from "../map/FloodRiskLayer";
import { MapLegend } from "../map/MapLegend";
import { mapPalette, stagingLayers } from "../map/map-style";

interface ImportPreviewMapProps {
  theme: ResolvedTheme;
  extent: BBox;
  data: StagingFeatureCollection | null;
  onViewChange: (view: MapView) => void;
  /** A flood risk run: its map is drawn instead of staged shapes (which it has none of). */
  floodRisk?: { layer: FloodRiskMap | null; imageUrl: string | null };
}

const LEGEND = [
  { key: "passed", label: "Passed its checks", swatch: "passed" },
  { key: "failed", label: "Failed (see the row's errors)", swatch: "failed" },
];

/**
 * "Preview before promote": every staged shape on a map before anything goes live, failed ones
 * in red, so a shape in the wrong place is caught by eye. Shapes that couldn't be read at all
 * have nothing to draw; they're listed in the table instead. A flood risk import has no shapes:
 * its map is drawn instead, over the base map, so a map that doesn't line up with the coast and
 * the rivers is caught by eye the same way.
 */
export function ImportPreviewMap({ theme, extent, data, onViewChange, floodRisk }: ImportPreviewMapProps) {
  const layers = useMemo(() => stagingLayers(mapPalette(theme)), [theme]);
  const legend = floodRisk ? (floodRisk.layer ? floodRiskLegend(floodRisk.layer.classes) : []) : LEGEND;
  return (
    <ClimateMap
      label={floodRisk ? "Map of the flood risk map in this import" : "Map of the staged shapes in this import"}
      theme={theme}
      fitTo={extent}
      onViewChange={onViewChange}
      className="detail-map"
      dataCy="import-preview-map"
      overlay={
        <div className="import-preview-map__legend">
          <MapLegend items={legend} />
        </div>
      }
    >
      {floodRisk ? (
        <FloodRiskLayer visible imageUrl={floodRisk.imageUrl} coordinates={floodRisk.layer?.coordinates ?? null} />
      ) : (
        data && (
          <Source id="staging" type="geojson" data={data}>
            <Layer {...layers.fill} />
            <Layer {...layers.line} />
          </Source>
        )
      )}
    </ClimateMap>
  );
}
