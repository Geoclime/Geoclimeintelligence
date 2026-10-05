import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { ResolvedTheme } from "../../contexts/ThemeContext";
import type { BBox } from "../../types/admin-unit.types";
import type { StagingFeatureCollection } from "../../types/import.types";
import { ClimateMap, type MapView } from "../map/ClimateMap";
import { MapLegend } from "../map/MapLegend";
import { mapPalette, stagingLayers } from "../map/map-style";

interface ImportPreviewMapProps {
  theme: ResolvedTheme;
  extent: BBox;
  data: StagingFeatureCollection | null;
  onViewChange: (view: MapView) => void;
}

const LEGEND = [
  { key: "passed", label: "Passed its checks", swatch: "passed" },
  { key: "failed", label: "Failed (see the row's errors)", swatch: "failed" },
];

/**
 * "Preview before promote": every staged shape on a map before anything goes live, failed ones
 * in red, so a shape in the wrong place is caught by eye. Shapes that couldn't be read at all
 * have nothing to draw; they're listed in the table instead.
 */
export function ImportPreviewMap({ theme, extent, data, onViewChange }: ImportPreviewMapProps) {
  const layers = useMemo(() => stagingLayers(mapPalette(theme)), [theme]);
  return (
    <ClimateMap
      label="Map of the staged shapes in this import"
      theme={theme}
      fitTo={extent}
      onViewChange={onViewChange}
      className="detail-map"
      dataCy="import-preview-map"
      overlay={
        <div className="import-preview-map__legend">
          <MapLegend items={LEGEND} />
        </div>
      }
    >
      {data && (
        <Source id="staging" type="geojson" data={data}>
          <Layer {...layers.fill} />
          <Layer {...layers.line} />
        </Source>
      )}
    </ClimateMap>
  );
}
