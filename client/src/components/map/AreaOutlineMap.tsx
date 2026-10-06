import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { ResolvedTheme } from "../../contexts/ThemeContext";
import type { AdminUnitFeatureCollection, BBox } from "../../types/admin-unit.types";
import { ClimateMap, type MapView } from "./ClimateMap";
import { mapPalette } from "./map-style";

interface AreaOutlineMapProps {
  label: string;
  theme: ResolvedTheme;
  /** The area this page is about, drawn bold and fitted to. */
  geometry: MultiPolygon;
  bbox: BBox;
  /** A larger area for context (e.g. the ward's LGA), drawn thin. */
  contextGeometry?: MultiPolygon | null;
  /** Areas inside this one (e.g. an LGA's wards), drawn dashed. */
  innerAreas?: AdminUnitFeatureCollection | null;
  onViewChange?: (view: MapView) => void;
  dataCy?: string;
}

const asFeature = (geometry: MultiPolygon): Feature<MultiPolygon> => ({ type: "Feature", geometry, properties: {} });

/** A small map that outlines one area: the LGA profile and ward pages use it. */
export function AreaOutlineMap({ label, theme, geometry, bbox, contextGeometry, innerAreas, onViewChange, dataCy }: AreaOutlineMapProps) {
  const palette = useMemo(() => mapPalette(theme), [theme]);
  const area = useMemo<FeatureCollection<MultiPolygon>>(
    () => ({ type: "FeatureCollection", features: [asFeature(geometry)] }),
    [geometry],
  );
  const context = useMemo<FeatureCollection<MultiPolygon> | null>(
    () => (contextGeometry ? { type: "FeatureCollection", features: [asFeature(contextGeometry)] } : null),
    [contextGeometry],
  );

  return (
    <ClimateMap label={label} theme={theme} fitTo={bbox} onViewChange={onViewChange} className="detail-map" dataCy={dataCy}>
      {context && (
        <Source id="context" type="geojson" data={context}>
          <Layer id="context-line" type="line" paint={{ "line-color": palette.lga, "line-width": 1.5 }} />
        </Source>
      )}
      {innerAreas && (
        <Source id="inner-areas" type="geojson" data={innerAreas}>
          <Layer
            id="inner-areas-line"
            type="line"
            paint={{ "line-color": palette.ward, "line-width": 0.9, "line-dasharray": [2, 2] }}
          />
        </Source>
      )}
      <Source id="area" type="geojson" data={area}>
        <Layer id="area-fill" type="fill" paint={{ "fill-color": palette.selected, "fill-opacity": 0.12 }} />
        <Layer id="area-line" type="line" paint={{ "line-color": palette.selected, "line-width": 2.5 }} />
      </Source>
    </ClimateMap>
  );
}
