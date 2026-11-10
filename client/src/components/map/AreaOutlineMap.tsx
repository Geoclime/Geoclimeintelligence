import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import { Fragment, useMemo, useState, type ReactNode } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { ResolvedTheme } from "../../contexts/ThemeContext";
import { useAuth } from "../../hooks/useAuth";
import { useCan, useSurveyAbilities } from "../../hooks/useCan";
import { useClippedFloodRisk } from "../../hooks/useClippedFloodRisk";
import { useFloodRisk } from "../../hooks/useFloodRisk";
import { useHouseholdLayer } from "../../hooks/useHouseholds";
import { useMapLayers } from "../../hooks/useMapLayers";
import type { AdminUnitFeatureCollection, BBox, LonLat } from "../../types/admin-unit.types";
import type { DrainageFeatureCollection, FloodExtentFeatureCollection, SelectedSurvey } from "../../types/field-survey.types";
import type { HouseholdOnMap } from "../../types/household.types";
import type { ClickedFeature, PlaceOnMap } from "../../types/map-layer.types";
import { floodRiskLegend } from "../../utils/flood-risk";
import { facilityIn, householdIn } from "../../utils/map-features";
import { READ_ONLY } from "../../utils/permissions";
import { FACILITY_DOTS_LAYER } from "../../utils/saved-places";
import { surveyFeatureIn } from "../../utils/survey-click";
import { PhotoSection } from "../photos/PhotoSection";
import { ClimateMap, type MapView } from "./ClimateMap";
import { FloodRiskLayer } from "./FloodRiskLayer";
import { HOUSEHOLD_LAYER, HouseholdLayer } from "./HouseholdLayer";
import { HouseholdPopup } from "./HouseholdPopup";
import { legendFor, OVERLAY_LEGEND, SURVEY_LEGEND } from "./legend-items";
import { MapLegend } from "./MapLegend";
import { MapOverlayLayers } from "./MapOverlayLayers";
import { mapPalette, type MapLayerId } from "./map-style";
import { SavedPlacePopup } from "./SavedPlacePopup";
import { SURVEY_INTERACTIVE_LAYERS, surveyLayers } from "./survey-style";
import { DrainageLayers } from "./SurveyLayers";
import "./flood-risk.css";

interface AreaOutlineMapProps {
  label: string;
  theme: ResolvedTheme;
  /** The area this page is about, drawn bold and fitted to. */
  geometry: MultiPolygon;
  /** Its id: the roads, waterways, facilities and households are cut to it, so only what is inside the place is drawn. */
  areaId?: string;
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
  /** A popup is open on the map: the switches and legend are hidden so the two never touch. */
  popupOpen?: boolean;
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
  floodPrediction: false,
  households: true,
};
const NO_LAYERS = Object.fromEntries(Object.keys(CONTEXT_LAYERS).map((id) => [id, false])) as Record<MapLayerId, boolean>;
const INTERACTIVE_LAYERS = [...SURVEY_INTERACTIVE_LAYERS, FACILITY_DOTS_LAYER, HOUSEHOLD_LAYER];

/**
 * A small map that outlines one area: the LGA profile and ward pages use it. Recorded floods and drains
 * are drawn exactly as on the main map, with a legend that explains them, and a switch adds the roads,
 * waterways, facilities and households around them, since a drain means little without the road it runs beside.
 * Given `areaId`, those are cut to the place's outline, as its flood risk is: the page is about what is inside it.
 */
export function AreaOutlineMap({ label, theme, geometry, areaId, bbox, contextGeometry, innerAreas, floods, drains, onSelect, countryCode, onViewChange, popupOpen = false, dataCy, children }: AreaOutlineMapProps) {
  const { user } = useAuth();
  const can = useCan();
  const mine = useSurveyAbilities();
  const abilities = useMemo(() => ({ ...READ_ONLY, viewPeople: mine.viewPeople, viewPhotos: mine.viewPhotos, userId: mine.userId }), [mine]);
  const palette = useMemo(() => mapPalette(theme), [theme]);
  // The same cached map as the home screen's: a profile opened after the home map asks nothing again.
  const floodRisk = useFloodRisk(countryCode ?? null);
  const [showFloodRisk, setShowFloodRisk] = useState(true);
  const [showContext, setShowContext] = useState(true);
  const [view, setView] = useState<MapView | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<PlaceOnMap | null>(null);
  const [selectedHousehold, setSelectedHousehold] = useState<HouseholdOnMap | null>(null);
  const activeBbox = view?.bbox ?? bbox;
  const context = useMapLayers(activeBbox, view?.zoom ?? 12, showContext ? CONTEXT_LAYERS : NO_LAYERS, 0, areaId);
  const households = useHouseholdLayer(activeBbox, showContext && Boolean(user), 0, areaId);
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
    ...(showContext && can("households.view") ? [{ key: "household-other", label: "Other people's households (staff only)", swatch: "household-other" }] : []),
  ];

  const handleMapClick = (point: LonLat, clicked: ClickedFeature[]) => {
    const household = householdIn(clicked);
    if (household) {
      setSelectedPlace(null);
      onSelect?.(null);
      setSelectedHousehold(household);
      return;
    }
    setSelectedHousehold(null);
    const place = facilityIn(clicked);
    if (place) {
      onSelect?.(null);
      setSelectedPlace(place);
      return;
    }
    setSelectedPlace(null);
    onSelect?.(surveyFeatureIn(clicked, point));
  };

  const anyPopupOpen = popupOpen || Boolean(selectedPlace || selectedHousehold);

  return (
    <ClimateMap
      label={label}
      theme={theme}
      fitTo={bbox}
      onViewChange={(next) => {
        setView(next);
        onViewChange?.(next);
      }}
      onMapClick={handleMapClick}
      interactiveLayerIds={INTERACTIVE_LAYERS}
      className="detail-map area-map"
      dataCy={dataCy}
      overlay={
        <div className={`area-map__legend${anyPopupOpen ? " is-hidden" : ""}`} data-cy="area-flood-risk-legend">
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
                {(context.loading || households.loading) && <span className="layer-toggle__hint">Loading…</span>}
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
        <HouseholdLayer palette={palette} data={households.data} />
        {floods && (
          <Source id="flood-extents" type="geojson" data={floods}>
            <Layer {...survey.floodFill} />
            <Layer {...survey.floodLine} />
            <Layer {...survey.floodRecededLine} />
          </Source>
        )}
        {drains && <DrainageLayers palette={palette} drains={drains} />}
        {selectedHousehold && <HouseholdPopup key={selectedHousehold.id} household={selectedHousehold} onClose={() => setSelectedHousehold(null)} />}
        {selectedPlace && (
          <SavedPlacePopup place={selectedPlace} onClose={() => setSelectedPlace(null)}>
            {(selectedPlace.origin ?? "manual") === "manual" && (
              <PhotoSection subject={{ type: "place", id: selectedPlace.id }} abilities={abilities} of={selectedPlace.name ?? "the place"} />
            )}
          </SavedPlacePopup>
        )}
        {children}
      </Fragment>
    </ClimateMap>
  );
}
