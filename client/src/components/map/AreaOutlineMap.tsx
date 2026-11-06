import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { ResolvedTheme } from "../../contexts/ThemeContext";
import { useClippedFloodRisk } from "../../hooks/useClippedFloodRisk";
import { useFloodRisk } from "../../hooks/useFloodRisk";
import { useMapLayers } from "../../hooks/useMapLayers";
import type { AdminUnitFeatureCollection, BBox } from "../../types/admin-unit.types";
import type { DrainageFeatureCollection, FloodExtentFeatureCollection, SelectedSurvey } from "../../types/field-survey.types";
import { floodRiskLegend } from "../../utils/flood-risk";
import { surveyFeatureIn } from "../../utils/survey-click";
import { ClimateMap, type MapView } from "./ClimateMap";
import { FloodRiskLayer } from "./FloodRiskLayer";
import { legendFor, OVERLAY_LEGEND, SURVEY_LEGEND } from "./legend-items";
import { MapLegend } from "./MapLegend";
import { MapOverlayLayers } from "./MapOverlayLayers";
import { mapPalette, type MapLayerId } from "./map-style";
import { SURVEY_INTERACTIVE_LAYERS, surveyLayers } from "./survey-style";
import { DrainageLayers } from "./SurveyLayers";
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

/** The layers the "Roads, water and facilities" switch shows: what's around the drains and floods, without boundaries or survey. */
const CONTEXT_LAYERS: Record<MapLayerId, boolean> = {
  state: false,
  lga: false,
  ward: false,
  roads: true,
  waterways: true,
  settlements: false,
  infrastructure: true,
  buildings: false,
  wetlands: false,
  floodExtents: false,
  drainage: false,
  floodRisk: false,
  satelliteFlood: false,
  households: false,
};
const NO_LAYERS = Object.fromEntries(Object.keys(CONTEXT_LAYERS).map((id) => [id, false])) as Record<MapLayerId, boolean>;

/**
 * A small map that outlines one area: the LGA profile and ward pages use it. Recorded floods and drains
 * are drawn exactly as on the main map, with a legend that explains them, and a switch adds the roads,
 * waterways and facilities around them, since a drain means little without the road it runs beside.
 */
export function AreaOutlineMap({ label, theme, geometry, bbox, contextGeometry, innerAreas, floods, drains, onSelect, countryCode, onViewChange, dataCy, children }: AreaOutlineMapProps) {
  const palette = useMemo(() => mapPalette(theme), [theme]);
  // The same cached map as the home screen's: a profile opened after the home map asks nothing again.
  const floodRisk = useFloodRisk(countryCode ?? null);
  const [showFloodRisk, setShowFloodRisk] = useState(true);
  const [showContext, setShowContext] = useState(true);
  const [view, setView] = useState<MapView | null>(null);
  const context = useMapLayers(view?.bbox ?? null, view?.zoom ?? 11, showContext ? CONTEXT_LAYERS : NO_LAYERS);
  const riskLayer = floodRisk.layer;
  // Only this area's part of the picture: the imported one covers the whole state.
  const areaRisk = useClippedFloodRisk(floodRisk.imageUrl, riskLayer?.coordinates ?? null, geometry);
  const survey = useMemo(() => surveyLayers(palette), [palette]);
  const area = useMemo<FeatureCollection<MultiPolygon>>(
    () => ({ type: "FeatureCollection", features: [asFeature(geometry)] }),
    [geometry],
  );
  const contextOutline = useMemo<FeatureCollection<MultiPolygon> | null>(
    () => (contextGeometry ? { type: "FeatureCollection", features: [asFeature(contextGeometry)] } : null),
    [contextGeometry],
  );

  const legendItems = [
    ...(riskLayer && showFloodRisk ? floodRiskLegend(riskLayer.classes) : []),
    ...legendFor(SURVEY_LEGEND, { floodExtents: Boolean(floods?.features.length), drainage: Boolean(drains?.features.length) }),
    ...(showContext ? legendFor(OVERLAY_LEGEND, CONTEXT_LAYERS) : []),
  ];

  return (
    <ClimateMap
      label={label}
      theme={theme}
      fitTo={bbox}
      onViewChange={(next) => {
        setView(next);
        onViewChange?.(next);
      }}
      onMapClick={onSelect ? (point, clicked) => onSelect(surveyFeatureIn(clicked, point)) : undefined}
      interactiveLayerIds={onSelect ? SURVEY_INTERACTIVE_LAYERS : undefined}
      className="detail-map"
      dataCy={dataCy}
      overlay={
        <div className="area-map__legend" data-cy="area-flood-risk-legend">
          <div className="map-panel layer-toggle">
            {riskLayer && (
              <label className="layer-toggle__option" data-cy="area-flood-risk-toggle">
                <input type="checkbox" checked={showFloodRisk} onChange={(event) => setShowFloodRisk(event.target.checked)} />
                <span className="layer-toggle__swatch layer-toggle__swatch--floodRisk" aria-hidden="true" />
                <span className="layer-toggle__text">
                  <span>Flood risk</span>
                  <span className="layer-toggle__hint">Relative risk, not a forecast</span>
                </span>
              </label>
            )}
            <label className="layer-toggle__option" data-cy="area-context-toggle">
              <input type="checkbox" checked={showContext} onChange={(event) => setShowContext(event.target.checked)} />
              <span className="layer-toggle__swatch layer-toggle__swatch--waterways" aria-hidden="true" />
              <span className="layer-toggle__text">
                <span>Roads, water and facilities</span>
                {context.loading && <span className="layer-toggle__hint">Loading…</span>}
              </span>
            </label>
          </div>
          {legendItems.length > 0 && <MapLegend items={legendItems} collapsible defaultOpen={false} />}
        </div>
      }
    >
      {/* Keyed by theme so a new style adds the layers back in this order. The flood risk comes first, under everything (see FloodRiskLayer). */}
      <Fragment key={palette.name}>
        <FloodRiskLayer visible={showFloodRisk && riskLayer !== null} imageUrl={areaRisk.imageUrl} coordinates={areaRisk.coordinates} />
        <MapOverlayLayers
          palette={palette}
          roads={context.roads.data}
          waterways={context.waterways.data}
          settlements={null}
          infrastructure={context.infrastructure.data}
          buildings={null}
          wetlands={null}
        />
        {contextOutline && (
          <Source id="context" type="geojson" data={contextOutline}>
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
        {drains && <DrainageLayers palette={palette} drains={drains} />}
        {children}
      </Fragment>
    </ClimateMap>
  );
}
