import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AdminBoundaryLayers } from "../../components/map/AdminBoundaryLayers";
import { AdminUnitPopup } from "../../components/map/AdminUnitPopup";
import { ClimateMap, type MapView } from "../../components/map/ClimateMap";
import { DeletePlaceDialog } from "../../components/map/DeletePlaceDialog";
import { FieldSurveyDock } from "../../components/map/FieldSurveyDock";
import { FieldSurveyForms, SurveyOnMap } from "../../components/map/FieldSurveyParts";
import { LayerToggle, type LayerOption } from "../../components/map/LayerToggle";
import { LocationTrace } from "../../components/map/LocationTrace";
import { MapLayerSources } from "../../components/map/MapLayerSources";
import { MapLegend } from "../../components/map/MapLegend";
import { MapOverlayLayers } from "../../components/map/MapOverlayLayers";
import { MyLocationLayer } from "../../components/map/MyLocationLayer";
import { MapOverviewPanel } from "../../components/map/MapOverviewPanel";
import { PinLayer } from "../../components/map/PinLayer";
import { PlaceFormDialog } from "../../components/map/PlaceFormDialog";
import { SavedPlacePopup } from "../../components/map/SavedPlacePopup";
import { SurveyLayers } from "../../components/map/SurveyLayers";
import { SURVEY_INTERACTIVE_LAYERS } from "../../components/map/survey-style";
import { TraceLineLayer } from "../../components/map/TraceLineLayer";
import {
  INTERACTIVE_LAYERS,
  mapPalette,
  OVERLAY_LAYER_IDS,
  WARD_MIN_ZOOM,
  type MapLayerId,
} from "../../components/map/map-style";
import { Button, buttonClassName } from "../../components/shared/Button";
import { EmptyState } from "../../components/shared/EmptyState";
import { Icon } from "../../components/shared/Icon";
import { useAdminUnits } from "../../hooks/useAdminUnits";
import { useAuth } from "../../hooks/useAuth";
import { useCountries } from "../../hooks/useCountries";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useFieldSurvey } from "../../hooks/useFieldSurvey";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useLocatePoint } from "../../hooks/useLocatePoint";
import { useMapLayerCatalog } from "../../hooks/useMapLayerCatalog";
import { useMapLayers } from "../../hooks/useMapLayers";
import { useSavedPlaces } from "../../hooks/useSavedPlaces";
import { useSurveyLayers } from "../../hooks/useSurveyLayers";
import { useTheme } from "../../hooks/useTheme";
import type { BBox, LonLat } from "../../types/admin-unit.types";
import type { ClickedFeature } from "../../types/map-layer.types";
import { boundsAround } from "../../utils/geo-distance";
import { readLayers, readMapView, readPin, readPinLabel, writeLayers, writeMapView, writePin } from "../../utils/map-url";
import { overlayHint } from "../../utils/overlay-layers";
import { hasAnyRole } from "../../utils/roles";
import { canRecordSurvey } from "../../utils/field-survey";
import { describeWhere, handSavedPlaceIn } from "../../utils/saved-places";
import "./MapPage.css";

const LEGEND = [
  { key: "state", label: "State boundary", swatch: "state" },
  { key: "lga", label: "LGA boundary", swatch: "lga" },
  { key: "ward", label: "Ward boundary", swatch: "ward" },
  { key: "selected", label: "Selected LGA", swatch: "selected" },
];

/** Legend rows for the feature layers; a row shows only while its layer is switched on. */
const OVERLAY_LEGEND = [
  { key: "roads", label: "Roads (main to local)", swatch: "roads", layer: "roads" },
  { key: "waterways", label: "Rivers and creeks", swatch: "waterways", layer: "waterways" },
  { key: "waterbodies", label: "Wide rivers and water bodies", swatch: "waterbodies", layer: "waterways" },
  { key: "settlements", label: "Settlements", swatch: "settlements", layer: "settlements" },
  { key: "buildings", label: "Buildings", swatch: "buildings", layer: "buildings" },
  { key: "facility-health", label: "Hospitals, clinics, pharmacies", swatch: "facility-health", layer: "infrastructure" },
  { key: "facility-education", label: "Schools and colleges", swatch: "facility-education", layer: "infrastructure" },
  { key: "facility-civic", label: "Police and government", swatch: "facility-civic", layer: "infrastructure" },
  { key: "facility-community", label: "Community centres and worship", swatch: "facility-community", layer: "infrastructure" },
  { key: "facility-other", label: "Markets, transport, water, telecom", swatch: "facility-other", layer: "infrastructure" },
] as const;

/** Legend rows for what responders recorded; a row shows only while its layer is switched on. */
const SURVEY_LEGEND = [
  { key: "flood", label: "Flood, as recorded", swatch: "flood", layer: "floodExtents" },
  { key: "flood-receded", label: "Flood, receded", swatch: "flood-receded", layer: "floodExtents" },
  { key: "drain-clear", label: "Drain: clear", swatch: "drain-clear", layer: "drainage" },
  { key: "drain-partly", label: "Drain: partly blocked", swatch: "drain-partly", layer: "drainage" },
  { key: "drain-bad", label: "Drain: blocked, overflowing or damaged", swatch: "drain-bad", layer: "drainage" },
] as const;

const sameSpot = (a: LonLat | null | undefined, b: LonLat | null | undefined) => Boolean(a && b && a[0] === b[0] && a[1] === b[1]);

/**
 * The home screen: a full-screen map of Rivers State with its LGAs (named on the map) and, zoomed
 * in, its wards, with roads, waterways, settlements, facilities and (at street level) buildings over them. Each layer is fetched only for
 * the visible area. The view, the selected LGA and
 * the visible layers live in the URL, so a link opens the same view (utils/map-url.ts).
 */
export function MapPage() {
  useDocumentTitle("Map");
  const { user } = useAuth();
  const { resolved: theme } = useTheme();
  const palette = useMemo(() => mapPalette(theme), [theme]);
  const [searchParams, setSearchParams] = useSearchParams();
  // Read once: whether the link carried its own view. If not, fit to the state when it loads.
  const [initialView] = useState(() => readMapView(searchParams));
  const [view, setView] = useState<MapView | null>(null);
  const [panelsOpen, setPanelsOpen] = useState(false);
  const [focus, setFocus] = useState<BBox | null>(null);
  const [focusNonce, setFocusNonce] = useState(0);
  // Bumped when an administrator saves, edits or deletes a place, so the facilities are fetched again.
  const [facilitiesRefresh, setFacilitiesRefresh] = useState(0);

  const layers = readLayers(searchParams);
  const selectedLgaId = searchParams.get("lga");
  const pin = readPin(searchParams);
  const pinLabel = readPinLabel(searchParams) ?? "Pinned place";
  const zoom = view?.zoom ?? initialView?.zoom ?? 8;

  const { countries, loading: countriesLoading } = useCountries();
  const { units: states } = useAdminUnits({ level: 1, pageSize: 10 });
  const { units: lgaList } = useAdminUnits({ level: 2, pageSize: 100 });
  const {
    state: stateLayer,
    lga: lgaLayer,
    ward: wardLayer,
    roads: roadLayer,
    waterways: waterwayLayer,
    settlements: settlementLayer,
    infrastructure: infrastructureLayer,
    buildings: buildingLayer,
    error: layerError,
  } = useMapLayers(view?.bbox ?? null, zoom, layers, facilitiesRefresh);
  const { catalog } = useMapLayerCatalog();
  const located = useLocatePoint();
  const geolocation = useGeolocation();

  const stateUnit = states[0] ?? null;
  const country = countries.find((c) => c.countryCode === stateUnit?.countryCode) ?? countries[0] ?? null;
  const selectedLga = lgaList.find((lga) => lga.id === selectedLgaId) ?? null;
  const isAdmin = user ? hasAnyRole(user.role, ["administrator"]) : false;
  // Two updates can land in the same tick (a layer tick and the map's own "moved" event). The router
  // builds each from the params of the last render, so the second would overwrite the first; this
  // keeps the latest params so every update starts from the one before it.
  const latestParams = useRef(searchParams);
  useEffect(() => {
    latestParams.current = searchParams;
  }, [searchParams]);

  const updateParams = useCallback(
    (update: (params: URLSearchParams) => URLSearchParams) => {
      const next = update(new URLSearchParams(latestParams.current));
      latestParams.current = next;
      setSearchParams(next, { replace: true });
    },
    [setSearchParams],
  );

  const handleViewChange = useCallback(
    (next: MapView) => {
      setView(next);
      updateParams((params) => writeMapView(params, next));
    },
    [updateParams],
  );

  const selectLga = useCallback(
    (id: string | null) =>
      updateParams((params) => {
        const next = new URLSearchParams(params);
        if (id) next.set("lga", id);
        else next.delete("lga");
        return next;
      }),
    [updateParams],
  );

  // Responders, officials and administrators record floods and drains on the ground; everyone sees them. What was
  // just saved is switched on to be seen, as a saved place is, and what just changed is drawn without waiting.
  const canRecord = user ? canRecordSurvey(user.role) : false;
  const revealLayer = useCallback(
    (id: MapLayerId) => updateParams((params) => writeLayers(params, { ...readLayers(params), [id]: true })),
    [updateParams],
  );
  const survey = useFieldSurvey(canRecord, revealLayer);
  const surveyData = useSurveyLayers(view?.bbox ?? null, layers, survey.refresh, survey.patches);

  // A saved, edited or deleted place changes the facilities layer: fetch it again, and switch it on so
  // a place just saved can be seen. The spot's own popup has done its job.
  const clearLocated = located.clear;
  const placesChanged = useCallback(() => {
    clearLocated();
    setFacilitiesRefresh((count) => count + 1);
    updateParams((params) => writeLayers(params, { ...readLayers(params), infrastructure: true }));
  }, [clearLocated, updateParams]);
  const savedPlaces = useSavedPlaces(placesChanged);

  const handleMapClick = useCallback(
    async (point: LonLat, clicked: ClickedFeature[] = []) => {
      // An administrator clicking a place they saved opens that place, instead of asking which ward it is in.
      const place = isAdmin ? handSavedPlaceIn(clicked) : null;
      if (place) {
        located.clear();
        savedPlaces.select(place);
        return;
      }
      savedPlaces.closeSelected();
      const result = await located.locate(point);
      const lga = result?.units.find((unit) => unit.level === 2);
      if (lga) selectLga(lga.id);
    },
    [isAdmin, located, savedPlaces, selectLga],
  );

  // A link with a pinned place (a flood report's "Open on the full map") opens with it marked and
  // its LGA and ward looked up, as if it had been tapped. Read once, on arrival.
  const pinHandled = useRef(false);
  useEffect(() => {
    if (pinHandled.current || !pin) return;
    pinHandled.current = true;
    void handleMapClick(pin);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Closing the popup of the pinned place takes the pin away with it.
  const closePopup = () => {
    const closing = located.point;
    located.clear();
    if (pin && closing && closing[0] === pin[0] && closing[1] === pin[1]) updateParams((params) => writePin(params, null));
  };

  /** Fits the map to a box, again even if it is the same box as last time. */
  const showBounds = (bounds: BBox) => {
    setFocus(bounds);
    setFocusNonce((nonce) => nonce + 1);
  };

  // With a pinned place on the map (a flood report's link), "Where am I?" brings you and it into view together.
  const whereAmI = async () => {
    const point = await geolocation.request();
    if (!point) return;
    showBounds(pin ? boundsAround([point, pin]) : [point[0] - 0.02, point[1] - 0.02, point[0] + 0.02, point[1] + 0.02]);
    await handleMapClick(point);
  };

  const toggleLayer = (id: MapLayerId, checked: boolean) =>
    updateParams((params) => writeLayers(params, { ...layers, [id]: checked }));

  // Empty until the layer list has loaded, so a layer is never called empty before we know.
  const featureCountOf = (id: (typeof OVERLAY_LAYER_IDS)[number]) => catalog.find((layer) => layer.id === id)?.featureCount ?? null;
  const hintFor = (id: (typeof OVERLAY_LAYER_IDS)[number], truncated: boolean | undefined) =>
    overlayHint(id, { zoom, truncated: truncated === true, featureCount: featureCountOf(id) });

  const layerOptions: LayerOption[] = [
    { id: "state", label: "State", checked: layers.state, loading: stateLayer.loading },
    { id: "lga", label: "LGAs", checked: layers.lga, loading: lgaLayer.loading },
    {
      id: "ward",
      label: "Wards",
      checked: layers.ward,
      loading: wardLayer.loading,
      hint: zoom < WARD_MIN_ZOOM ? "Zoom in to see wards" : undefined,
    },
    {
      id: "roads",
      label: "Roads",
      checked: layers.roads,
      loading: roadLayer.loading,
      hint: hintFor("roads", roadLayer.data?.truncated),
    },
    {
      id: "waterways",
      label: "Waterways",
      checked: layers.waterways,
      loading: waterwayLayer.loading,
      hint: hintFor("waterways", waterwayLayer.data?.truncated),
    },
    {
      id: "settlements",
      label: "Settlements",
      checked: layers.settlements,
      loading: settlementLayer.loading,
      hint: hintFor("settlements", settlementLayer.data?.truncated),
    },
    {
      id: "infrastructure",
      label: "Facilities",
      checked: layers.infrastructure,
      loading: infrastructureLayer.loading,
      hint: hintFor("infrastructure", infrastructureLayer.data?.truncated),
    },
    {
      id: "buildings",
      label: "Buildings",
      checked: layers.buildings,
      loading: buildingLayer.loading,
      hint: hintFor("buildings", buildingLayer.data?.truncated),
    },
    {
      id: "floodExtents",
      label: "Floods",
      checked: layers.floodExtents,
      loading: surveyData.floodExtents.loading,
      hint: surveyData.floodExtents.data?.truncated ? "Zoom in to see them all" : undefined,
    },
    {
      id: "drainage",
      label: "Drainage",
      checked: layers.drainage,
      loading: surveyData.drainage.loading,
      hint: surveyData.drainage.data?.truncated ? "Zoom in to see them all" : undefined,
    },
  ];
  const fix = geolocation.fix;
  const layerProblem = layerError ?? surveyData.floodExtents.error ?? surveyData.drainage.error;
  const legendItems = [
    ...LEGEND,
    ...(pin ? [{ key: "pin", label: "Pinned place", swatch: "pin" }] : []),
    ...(fix ? [{ key: "you", label: "Your location", swatch: "you" }] : []),
    ...OVERLAY_LEGEND.filter((item) => layers[item.layer]),
    ...SURVEY_LEGEND.filter((item) => layers[item.layer]),
  ];
  // Mapbox stacks layers in the order they were added, and a boundary layer is added when its data
  // arrives. Remounting the markers whenever one appears or goes puts them back on top of the tint.
  const markerKey = [stateLayer.data, lgaLayer.data, wardLayer.data].map(Boolean).join();
  // The cards and panels float over the map, so a fit to a chosen box keeps clear of them.
  const fitPadding = focus
    ? window.innerWidth >= 900
      ? { top: 230, right: 340, bottom: 70, left: 380 }
      : { top: 420, right: 24, bottom: 110, left: 24 }
    : undefined;
  const popupTitle = sameSpot(located.point, fix?.point) ? "You are here" : sameSpot(located.point, pin) ? pinLabel : undefined;
  const visibleOverlays = OVERLAY_LAYER_IDS.filter((id) => layers[id]);

  const noCountry = !countriesLoading && countries.length === 0;

  return (
    <div className="map-page" data-cy="map-page">
      <ClimateMap
        label="Map of the states on the platform, their local government areas and wards"
        theme={theme}
        initialView={initialView ?? undefined}
        fitTo={focus ?? (initialView ? null : (stateUnit?.bbox ?? null))}
        fitNonce={focusNonce}
        fitPadding={fitPadding}
        onViewChange={handleViewChange}
        onMapClick={(point, clicked) => {
          // While a walk is open, and on a recorded flood or drain, the click belongs to field survey: no other popup opens over it.
          if (survey.handleMapClick(point, clicked)) {
            located.clear();
            savedPlaces.closeSelected();
            return;
          }
          survey.selection.closeSelected();
          void handleMapClick(point, clicked);
        }}
        interactiveLayerIds={[...INTERACTIVE_LAYERS, ...SURVEY_INTERACTIVE_LAYERS]}
        className="map-page__map"
        dataCy="home-map"
      >
        <MapOverlayLayers
          palette={palette}
          roads={roadLayer.data}
          waterways={waterwayLayer.data}
          settlements={settlementLayer.data}
          infrastructure={infrastructureLayer.data}
          buildings={buildingLayer.data}
        />
        <SurveyLayers palette={palette} floods={surveyData.floodExtents.data} drains={surveyData.drainage.data} />
        <AdminBoundaryLayers
          palette={palette}
          state={stateLayer.data}
          lgas={lgaLayer.data}
          wards={wardLayer.data}
          lgaLabels={layers.lga ? lgaList : []}
          selectedLgaId={selectedLgaId}
        />
        {pin && fix && <TraceLineLayer key={`line-${markerKey}`} from={fix.point} to={pin} palette={palette} />}
        {pin && <PinLayer key={`pin-${markerKey}`} point={pin} palette={palette} label={pinLabel} />}
        {fix && <MyLocationLayer key={`me-${markerKey}`} fix={fix} palette={palette} />}
        {located.point && (
          <AdminUnitPopup
            point={located.point}
            result={located.result}
            loading={located.loading}
            error={located.error}
            onClose={closePopup}
            title={popupTitle}
            onSavePlace={isAdmin ? () => savedPlaces.openCreate(located.point!, describeWhere(located.result)) : undefined}
          />
        )}
        {savedPlaces.selected && (
          <SavedPlacePopup
            place={savedPlaces.selected}
            onEdit={() => savedPlaces.openEdit(savedPlaces.selected!)}
            onDelete={() => savedPlaces.askRemove(savedPlaces.selected)}
            onClose={savedPlaces.closeSelected}
          />
        )}
        <SurveyOnMap survey={survey} palette={palette} canRecord={canRecord} layerKey={markerKey} />
      </ClimateMap>

      <div className="map-page__top">
        <MapOverviewPanel
          country={country}
          stateUnit={stateUnit}
          selectedLga={selectedLga}
          onClearLga={() => selectLga(null)}
          onWhereAmI={() => void whereAmI()}
          locating={geolocation.locating || located.loading}
          geoError={geolocation.error}
        />
        {pin && (
          <LocationTrace
            pin={pin}
            label={pinLabel}
            me={fix?.point ?? null}
            onShow={showBounds}
            onClear={() => updateParams((params) => writePin(params, null))}
          />
        )}
        {layerProblem && (
          <p className="map-panel map-page__error" role="alert" data-cy="layer-error">
            Some map layers couldn't load: {layerProblem}
          </p>
        )}
      </div>

      <div className={`map-page__panels${panelsOpen ? " is-open" : ""}`} id="map-panels">
        <LayerToggle layers={layerOptions} onChange={toggleLayer} />
        <MapLegend items={legendItems} note="Boundaries: geoBoundaries (CC BY 4.0). Wards: GRID3 operational placeholders (CC BY 4.0)." />
        <MapLayerSources catalog={catalog} visible={visibleOverlays} />
      </div>
      <Button
        variant="secondary"
        size="sm"
        className="map-page__panels-toggle"
        icon={<Icon name="layers" size={16} />}
        aria-expanded={panelsOpen}
        aria-controls="map-panels"
        onClick={() => setPanelsOpen((open) => !open)}
        data-cy="toggle-map-panels"
      >
        {panelsOpen ? "Hide layers" : "Layers"}
      </Button>

      {savedPlaces.form && (
        <PlaceFormDialog
          key={savedPlaces.formKey}
          target={savedPlaces.form}
          onClose={savedPlaces.closeForm}
          onSubmit={savedPlaces.submit}
          onDone={savedPlaces.finished}
        />
      )}
      <DeletePlaceDialog place={savedPlaces.removing} onClose={savedPlaces.closeRemove} onConfirm={savedPlaces.confirmRemove} />

      {canRecord && <FieldSurveyDock survey={survey} />}
      <FieldSurveyForms survey={survey} />

      {noCountry && (
        <div className="map-page__empty" data-cy="map-empty">
          <div className="card">
            <EmptyState
              icon="globe"
              title={isAdmin ? "Set up your first country" : "No map data yet"}
              message={
                isAdmin
                  ? "Create the country and its levels (for Nigeria: State, LGA, Ward), then import the boundaries."
                  : "An administrator hasn't loaded any boundaries yet. Check back soon."
              }
              action={
                isAdmin ? (
                  <Link to="/admin/countries/new" className={buttonClassName()} data-cy="setup-first-country">
                    Set up your first country
                  </Link>
                ) : undefined
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
