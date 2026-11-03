import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import { useMemo, useState, type ReactNode } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { ResolvedTheme } from "../../contexts/ThemeContext";
import { useClippedFloodRisk } from "../../hooks/useClippedFloodRisk";
import { useFloodRisk } from "../../hooks/useFloodRisk";
import type { AdminUnitFeatureCollection, BBox } from "../../types/admin-unit.types";
import type { DrainageFeatureCollection, FloodExtentFeatureCollection, SelectedSurvey } from "../../types/field-survey.types";
import { floodRiskLegend } from "../../utils/flood-risk";
import { surveyFeatureIn } from "../../utils/survey-click";
import { ClimateMap, type MapView } from "./ClimateMap";
import { FloodRiskLayer } from "./FloodRiskLayer";
import { MapLegend } from "./MapLegend";
import { mapPalette } from "./map-style";
import { SURVEY_INTERACTIVE_LAYERS, surveyLayers } from "./survey-style";
import "./flood-risk.css";

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
  /** Floods and drains recorded in this area, drawn as on the main map. */
  floods?: FloodExtentFeatureCollection | null;
  drains?: DrainageFeatureCollection | null;
  /** Called with the flood or drain that was clicked, or null for a click elsewhere. Makes them clickable. */
  onSelect?: (selected: SelectedSurvey | null) => void;
  /**
   * The country the area is in. When it has a live flood risk map, the map draws it under the outline,
   * cut to this area (the rest of the state is left clear), with a switch to hide it so the outline
   * and the recorded floods can be read on their own.
   */
  countryCode?: string;
  onViewChange?: (view: MapView) => void;
  dataCy?: string;
  /** Anything else to draw on the map, such as the popup of the flood or drain that was clicked. */
  children?: ReactNode;
}

const asFeature = (geometry: MultiPolygon): Feature<MultiPolygon> => ({ type: "Feature", geometry, properties: {} });

/** A small map that outlines one area: the LGA profile and ward pages use it. */
export function AreaOutlineMap({ label, theme, geometry, bbox, contextGeometry, innerAreas, floods, drains, onSelect, countryCode, onViewChange, dataCy, children }: AreaOutlineMapProps) {
  const palette = useMemo(() => mapPalette(theme), [theme]);
  // The same cached map as the home screen's: a profile opened after the home map asks nothing again.
  const floodRisk = useFloodRisk(countryCode ?? null);
  const [showFloodRisk, setShowFloodRisk] = useState(true);
  const riskLayer = floodRisk.layer;
  // Only this area's part of the picture: the imported one covers the whole state.
  const areaRisk = useClippedFloodRisk(floodRisk.imageUrl, riskLayer?.coordinates ?? null, geometry);
  const survey = useMemo(() => surveyLayers(palette), [palette]);
  const area = useMemo<FeatureCollection<MultiPolygon>>(
    () => ({ type: "FeatureCollection", features: [asFeature(geometry)] }),
    [geometry],
  );
  const context = useMemo<FeatureCollection<MultiPolygon> | null>(
    () => (contextGeometry ? { type: "FeatureCollection", features: [asFeature(contextGeometry)] } : null),
    [contextGeometry],
  );

  return (
    <ClimateMap
      label={label}
      theme={theme}
      fitTo={bbox}
      onViewChange={onViewChange}
      onMapClick={onSelect ? (point, clicked) => onSelect(surveyFeatureIn(clicked, point)) : undefined}
      interactiveLayerIds={onSelect ? SURVEY_INTERACTIVE_LAYERS : undefined}
      className="detail-map"
      dataCy={dataCy}
      overlay={
        riskLayer ? (
          <div className="area-map__legend" data-cy="area-flood-risk-legend">
            <div className="map-panel layer-toggle">
              <label className="layer-toggle__option" data-cy="area-flood-risk-toggle">
                <input type="checkbox" checked={showFloodRisk} onChange={(event) => setShowFloodRisk(event.target.checked)} />
                <span className="layer-toggle__swatch layer-toggle__swatch--floodRisk" aria-hidden="true" />
                <span className="layer-toggle__text">
                  <span>Flood risk</span>
                  <span className="layer-toggle__hint">Relative risk, not a forecast</span>
                </span>
              </label>
            </div>
            {showFloodRisk && <MapLegend items={floodRiskLegend(riskLayer.classes)} />}
          </div>
        ) : undefined
      }
    >
      {/* First, and always mounted, so it stays under the outline and the recorded floods (see FloodRiskLayer). */}
      <FloodRiskLayer visible={showFloodRisk && riskLayer !== null} imageUrl={areaRisk.imageUrl} coordinates={areaRisk.coordinates} />
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
      {floods && (
        <Source id="flood-extents" type="geojson" data={floods}>
          <Layer {...survey.floodFill} />
          <Layer {...survey.floodLine} />
          <Layer {...survey.floodRecededLine} />
        </Source>
      )}
      {drains && (
        <Source id="drainage" type="geojson" data={drains}>
          <Layer {...survey.drainHit} />
          <Layer {...survey.drainLine} />
          <Layer {...survey.drainPoints} />
        </Source>
      )}
      {children}
    </ClimateMap>
  );
}
