import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { AdminBoundaryLayers } from "../../components/map/AdminBoundaryLayers";
import { AdminUnitPopup } from "../../components/map/AdminUnitPopup";
import { ClimateMap, type MapView } from "../../components/map/ClimateMap";
import { DeletePlaceDialog } from "../../components/map/DeletePlaceDialog";
import { FieldSurveyDock } from "../../components/map/FieldSurveyDock";
import { FieldSurveyForms, SurveyOnMap } from "../../components/map/FieldSurveyParts";
import { FLOOD_PREDICTION_LEGEND, FLOOD_PREDICTION_NOTE, FloodPredictionLayer } from "../../components/map/FloodPredictionLayer";
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
import { FloodRiskLayer } from "../../components/map/FloodRiskLayer";
import { SatelliteFloodLayer } from "../../components/map/SatelliteFloodLayer";
import { SatelliteFloodPanel } from "../../components/map/SatelliteFloodPanel";
import { Button, buttonClassName } from "../../components/shared/Button";
import { EmptyState } from "../../components/shared/EmptyState";
import { Icon } from "../../components/shared/Icon";
import { useAdminUnits } from "../../hooks/useAdminUnits";
import { useAuth } from "../../hooks/useAuth";
import { useCountries } from "../../hooks/useCountries";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useFieldSurvey } from "../../hooks/useFieldSurvey";
import { useFloodPredictions } from "../../hooks/useFloodPrediction";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useLocatePoint } from "../../hooks/useLocatePoint";
import { useFloodRisk } from "../../hooks/useFloodRisk";
import { useFloodRiskAt } from "../../hooks/useFloodRiskAt";
import { useMapLayerCatalog } from "../../hooks/useMapLayerCatalog";
import { useMapLayers } from "../../hooks/useMapLayers";
import { useSatelliteFlood } from "../../hooks/useSatelliteFlood";
import { useSavedPlaces } from "../../hooks/useSavedPlaces";
import { useSurveyLayers } from "../../hooks/useSurveyLayers";
import { useTheme } from "../../hooks/useTheme";
import type { BBox, LonLat } from "../../types/admin-unit.types";
import { DEFAULT_OUTLOOK_DAYS } from "../../types/flood-prediction.types";
import type { ClickedFeature } from "../../types/map-layer.types";
import { boundsAround } from "../../utils/geo-distance";
import { readMapFocus } from "../../utils/map-focus";
import {
  readBase,
  readFloodMonth,
  readLayers,
  readMapView,
  readPin,
  readPinLabel,
  writeBase,
  writeFloodMonth,
  writeLayers,
  writeMapView,
  writePin,
  type MapBase,
} from "../../utils/map-url";
import { satelliteFloodLegend, satelliteFloodNote } from "../../utils/satellite-flood";
import { facilityIn, householdIn } from "../../utils/map-features";
import { HOUSEHOLD_LAYER, HouseholdLayer } from "../../components/map/HouseholdLayer";
import { HouseholdPopup } from "../../components/map/HouseholdPopup";
import { HouseholdFormDialog } from "../../components/map/HouseholdFormDialog";
import { useHouseholdLayer, useHouseholds } from "../../hooks/useHouseholds";
import { useFeaturesHere } from "../../hooks/useFeaturesHere";
import { legendFor, OVERLAY_LEGEND, SURVEY_LEGEND } from "../../components/map/legend-items";
import { DRAIN_CLUSTER_LAYER } from "../../components/map/survey-style";
import { floodRiskLegend, floodRiskNote } from "../../utils/flood-risk";
import { overlayHint } from "../../utils/overlay-layers";
import { hasAnyRole } from "../../utils/roles";
import { mayRecordAnything } from "../../utils/permissions";
import { useCan, useSurveyAbilities } from "../../hooks/useCan";
import { FloodImpactLayer } from "../../components/map/FloodImpactLayer";
import { PhotoSection } from "../../components/photos/PhotoSection";
import { describeWhere, handSavedPlaceIn } from "../../utils/saved-places";
import "./MapPage.css";

const LEGEND = [
  { key: "state", label: "State boundary", swatch: "state" },
  { key: "lga", label: "LGA boundary", swatch: "lga" },
  { key: "ward", label: "Ward boundary", swatch: "ward" },
  { key: "selected", label: "Selected LGA", swatch: "selected" },
];

/** The headings the layer list is grouped under. */
const GROUP = { boundaries: "Boundaries", ground: "Places and services", water: "Water", survey: "Recorded on the ground", hazard: "Hazard" } as const;

const BOUNDARY_NOTE = "Boundaries: geoBoundaries (CC BY 4.0). Wards: GRID3 operational placeholders (CC BY 4.0).";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const base = readBase(searchParams);
  // Imagery is dark whatever the theme, so the dark palette's brighter colours are the ones that read on it.
  const palette = useMemo(() => mapPalette(base === "satellite" ? "dark" : theme), [base, theme]);
  // What was drawn under the last click (a road, a waterway), for the popup's "Here" lines.
  const { here, show: showHere } = useFeaturesHere();
  const location = useLocation();
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
    wetlands: wetlandLayer,
    error: layerError,
  } = useMapLayers(view?.bbox ?? null, zoom, layers, facilitiesRefresh);
  const { catalog } = useMapLayerCatalog();
  const located = useLocatePoint();
  const geolocation = useGeolocation();

  const stateUnit = states[0] ?? null;
  const country = countries.find((c) => c.countryCode === stateUnit?.countryCode) ?? countries[0] ?? null;
  // The imported flood risk map, once an administrator has promoted one. Until then there is no toggle for it.
  const floodRisk = useFloodRisk(country?.countryCode ?? null);
  const floodRiskLayer = floodRisk.layer;
  const floodRiskOn = layers.floodRisk && floodRiskLayer !== null;
  const clickedRisk = useFloodRiskAt(country?.countryCode ?? null, located.point, floodRiskOn);
  // Monthly water seen by satellite, once an administrator has promoted a month: the one in the link, else the latest.
  const satellite = useSatelliteFlood(country?.countryCode ?? null, readFloodMonth(searchParams), layers.satelliteFlood);
  const satelliteLayer = satellite.layer;
  const satelliteOn = layers.satelliteFlood && satelliteLayer !== null;
  // 7-day modelled flood prediction choropleth across LGAs
  const floodPrediction = useFloodPredictions(country?.countryCode ?? null, DEFAULT_OUTLOOK_DAYS, layers.floodPrediction);
  const floodPredictionOn = layers.floodPrediction;
  const selectedLga = lgaList.find((lga) => lga.id === selectedLgaId) ?? null;
  const isAdmin = user ? hasAnyRole(user.role, ["administrator"]) : false;
  const can = useCan();
  const abilities = useSurveyAbilities();
  // Saving places by hand is a permission (administrators only as seeded), not a role.
  const canManagePlaces = can("places.manage");
  // The flood whose buildings, roads and facilities are drawn over the map, from its popup.
  const [impactFloodId, setImpactFloodId] = useState<string | null>(null);
  const toggleImpact = useCallback((floodId: string) => setImpactFloodId((current) => (current === floodId ? null : floodId)), []);
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

  const chooseFloodMonth = useCallback((yearMonth: string) => updateParams((params) => writeFloodMonth(params, yearMonth)), [updateParams]);

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

  // Whoever's role may record floods or drains does so on the ground (a permission the Roles screen sets); everyone sees
  // them. What was just saved is switched on to be seen, as a saved place is, and what just changed is drawn without waiting.
  const canRecord = mayRecordAnything(abilities);
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

  // Households: anyone signed in marks their own home; staff with households.view see everyone's.
  const [householdsRefresh, setHouseholdsRefresh] = useState(0);
  const householdsChanged = useCallback(() => {
    clearLocated();
    setHouseholdsRefresh((count) => count + 1);
    updateParams((params) => writeLayers(params, { ...readLayers(params), households: true }));
  }, [clearLocated, updateParams]);
  const households = useHouseholds(householdsChanged);
  const householdLayer = useHouseholdLayer(view?.bbox ?? null, layers.households && Boolean(user), householdsRefresh);

  const handleMapClick = useCallback(
    async (point: LonLat, clicked: ClickedFeature[] = []) => {
      // Clicking a facility opens it, for anyone: what it is and where it came from. An administrator
      // also gets Edit and Delete on a place saved by hand.
      // A household (your own, or anyone's for staff) opens before anything under it.
      const household = householdIn(clicked);
      if (household) {
        located.clear();
        savedPlaces.closeSelected();
        households.select(household);
        return;
      }
      households.closeSelected();
      const place = (canManagePlaces ? handSavedPlaceIn(clicked) : null) ?? facilityIn(clicked);
      if (place) {
        located.clear();
        savedPlaces.select(place);
        return;
      }
      savedPlaces.closeSelected();
      showHere(clicked);
      const result = await located.locate(point);
      const lga = result?.units.find((unit) => unit.level === 2);
      if (lga) selectLga(lga.id);
    },
    [canManagePlaces, households, located, savedPlaces, selectLga, showHere],
  );

  // A link with a pinned place (a flood report's "Open on the full map") opens with it marked and
  // its LGA and ward looked up, as if it had been tapped. Read once, on arrival.
  // A place chosen in the top bar's search brings its own request (below), which looks the pin up itself.
  const pinHandled = useRef(false);
  useEffect(() => {
    if (pinHandled.current || !pin || readMapFocus(location.state)) return;
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

  // A place chosen in the top bar's search (utils/map-focus.ts): bring it into view, and for a pinned
  // community look up its LGA and ward. This runs on arrival and also when the map is already open,
  // where a changed address alone would not move it. The map's own address updates replace this
  // entry, so the request is gone by the time anyone reloads or goes back to it.
  const handledFocus = useRef<string | null>(null);
  useEffect(() => {
    const request = readMapFocus(location.state);
    if (!request || handledFocus.current === location.key) return;
    handledFocus.current = location.key;
    located.clear();
    savedPlaces.closeSelected();
    showBounds(request.bounds);
    if (request.pin) void handleMapClick(request.pin.point);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  // With a pinned place on the map (a flood report's link), "Where am I?" brings you and it into view together.
  const whereAmI = async () => {
    const point = await geolocation.request();
    if (!point) return;
    showBounds(pin ? boundsAround([point, pin]) : [point[0] - 0.02, point[1] - 0.02, point[0] + 0.02, point[1] + 0.02]);
    await handleMapClick(point);
  };

  const toggleLayer = (id: MapLayerId, checked: boolean) =>
    updateParams((params) => writeLayers(params, { ...layers, [id]: checked }));
  const chooseBase = (next: MapBase) => updateParams((params) => writeBase(params, next));

  // Empty until the layer list has loaded, so a layer is never called empty before we know.
  const featureCountOf = (id: (typeof OVERLAY_LAYER_IDS)[number]) => catalog.find((layer) => layer.id === id)?.featureCount ?? null;
  const hintFor = (id: (typeof OVERLAY_LAYER_IDS)[number], truncated: boolean | undefined) =>
    overlayHint(id, { zoom, truncated: truncated === true, featureCount: featureCountOf(id) });

  const layerOptions: LayerOption[] = [
    { id: "state", label: "State", checked: layers.state, loading: stateLayer.loading, group: GROUP.boundaries },
    { id: "lga", label: "LGAs", checked: layers.lga, loading: lgaLayer.loading, group: GROUP.boundaries },
    {
      id: "ward",
      label: "Wards",
      checked: layers.ward,
      loading: wardLayer.loading,
      hint: zoom < WARD_MIN_ZOOM ? "Zoom in to see wards" : undefined,
      group: GROUP.boundaries,
    },
    {
      id: "roads",
      label: "Roads",
      checked: layers.roads,
      loading: roadLayer.loading,
      hint: hintFor("roads", roadLayer.data?.truncated),
      group: GROUP.ground,
    },
    {
      id: "settlements",
      label: "Settlements",
      checked: layers.settlements,
      loading: settlementLayer.loading,
      hint: hintFor("settlements", settlementLayer.data?.truncated),
      group: GROUP.ground,
    },
    {
      id: "infrastructure",
      label: "Facilities",
      checked: layers.infrastructure,
      loading: infrastructureLayer.loading,
      hint: hintFor("infrastructure", infrastructureLayer.data?.truncated),
      group: GROUP.ground,
    },
    {
      id: "households",
      label: can("households.view") ? "Households" : "My households",
      checked: layers.households,
      loading: householdLayer.loading,
      hint: can("households.view") ? "Everyone's homes: staff only" : "Only you and staff can see yours",
      group: GROUP.ground,
    },
    {
      id: "buildings",
      label: "Buildings",
      checked: layers.buildings,
      loading: buildingLayer.loading,
      hint: hintFor("buildings", buildingLayer.data?.truncated),
      group: GROUP.ground,
    },
    {
      id: "waterways",
      label: "Waterways",
      checked: layers.waterways,
      loading: waterwayLayer.loading,
      hint: hintFor("waterways", waterwayLayer.data?.truncated),
      group: GROUP.water,
    },
    {
      id: "wetlands",
      label: "Wetlands",
      checked: layers.wetlands,
      loading: wetlandLayer.loading,
      hint: hintFor("wetlands", wetlandLayer.data?.truncated),
      group: GROUP.water,
    },
    {
      id: "floodExtents",
      label: "Floods",
      checked: layers.floodExtents,
      loading: surveyData.floodExtents.loading,
      hint: surveyData.floodExtents.data?.truncated ? "Zoom in to see them all" : undefined,
      group: GROUP.survey,
    },
    {
      id: "drainage",
      label: "Drainage",
      checked: layers.drainage,
      loading: surveyData.drainage.loading,
      hint: surveyData.drainage.data?.truncated ? "Zoom in to see them all" : undefined,
      group: GROUP.survey,
    },
    {
      id: "floodPrediction",
      label: "Flood forecast (7-day)",
      checked: layers.floodPrediction,
      loading: floodPredictionOn && floodPrediction.loading,
      hint: "Modelled 7-day LGA flood likelihood",
      group: GROUP.hazard,
    },
    ...(floodRiskLayer
      ? [{ id: "floodRisk" as const, label: "Flood risk", checked: layers.floodRisk, loading: floodRisk.loading, hint: "Relative risk, not a forecast", group: GROUP.hazard }]
      : []),
    ...(satellite.months.length > 0
      ? [
          {
            id: "satelliteFlood" as const,
            label: "Water seen by satellite",
            checked: layers.satelliteFlood,
            loading: satelliteOn && satellite.loading,
            hint: "Monthly, Sentinel-1 radar",
            group: GROUP.hazard,
          },
        ]
      : []),
  ];
  const fix = geolocation.fix;
  const layerProblem =
    layerError ??
    surveyData.floodExtents.error ??
    surveyData.drainage.error ??
    floodRisk.error ??
    (floodPredictionOn ? floodPrediction.error : null) ??
    (satelliteOn ? satellite.error : null);
  const legendItems = [
    ...LEGEND,
    ...(pin ? [{ key: "pin", label: "Pinned place", swatch: "pin" }] : []),
    ...(fix ? [{ key: "you", label: "Your location", swatch: "you" }] : []),
    ...(floodPredictionOn ? FLOOD_PREDICTION_LEGEND : []),
    ...(floodRiskOn ? floodRiskLegend(floodRiskLayer.classes) : []),
    ...(satelliteOn ? satelliteFloodLegend(satelliteLayer) : []),
    ...legendFor(OVERLAY_LEGEND, layers),
    ...legendFor(SURVEY_LEGEND, layers),
    ...(impactFloodId ? [{ key: "impact", label: "What the chosen flood reaches", swatch: "impact" }] : []),
    ...(layers.households && can("households.view") ? [{ key: "household-other", label: "Other people's households (staff only)", swatch: "household-other" }] : []),
  ];
  const legendNote = [
    BOUNDARY_NOTE,
    floodPredictionOn ? FLOOD_PREDICTION_NOTE : null,
    floodRiskOn ? floodRiskNote(floodRiskLayer) : null,
    satelliteOn ? satelliteFloodNote(satelliteLayer) : null,
  ]
    .filter(Boolean)
    .join(" ");
  // Mapbox stacks layers in the order they were added, and a boundary layer is added when its data
  // arrives. Remounting the markers whenever one appears or goes puts them back on top of the tint.
  const markerKey = [stateLayer.data, lgaLayer.data, wardLayer.data].map(Boolean).join();
  // The cards and panels float over the map, so a fit to a chosen box keeps clear of them.
  const fitPadding = focus
    ? window.innerWidth >= 900
      ? { top: 230, right: 340, bottom: 70, left: 380 }
      : { top: 420, right: 24, bottom: 110, left: 24 }
    : undefined;
  // Only a place an administrator saved by hand can be changed; an imported facility belongs to its source.
  const editableSelected = canManagePlaces && (savedPlaces.selected?.origin ?? "manual") === "manual";
  const popupTitle = sameSpot(located.point, fix?.point) ? "You are here" : sameSpot(located.point, pin) ? pinLabel : undefined;
  const visibleOverlays = OVERLAY_LAYER_IDS.filter((id) => layers[id]);

  const noCountry = !countriesLoading && countries.length === 0;

  return (
    <div className="map-page" data-cy="map-page">
      <ClimateMap
        label="Map of the states on the platform, their local government areas and wards"
        theme={theme}
        satellite={base === "satellite"}
        initialView={initialView ?? undefined}
        fitTo={focus ?? (initialView ? null : (stateUnit?.bbox ?? null))}
        fitNonce={focusNonce}
        fitPadding={fitPadding}
        onViewChange={handleViewChange}
        onMapClick={(point, clicked) => {
          // A cluster of drainage points zooms in on its own (SurveyLayers.tsx ClusterZoom); nothing else opens.
          if (!survey.recorder.target && clicked.some((feature) => feature.layerId === DRAIN_CLUSTER_LAYER)) return;
          // While a walk is open, and on a recorded flood or drain, the click belongs to field survey: no other popup opens over it.
          if (survey.handleMapClick(point, clicked)) {
            located.clear();
            savedPlaces.closeSelected();
            return;
          }
          survey.selection.closeSelected();
          void handleMapClick(point, clicked);
        }}
        interactiveLayerIds={[...INTERACTIVE_LAYERS, ...SURVEY_INTERACTIVE_LAYERS, HOUSEHOLD_LAYER]}
        className="map-page__map"
        dataCy="home-map"
      >
        {/* Keyed by the base map and theme: a new style drops every layer, and remounting adds them back in this order. */}
        <Fragment key={`${base}-${palette.name}`}>
        <FloodRiskLayer visible={floodRiskOn} imageUrl={floodRisk.imageUrl} coordinates={floodRiskLayer?.coordinates ?? null} />
        <SatelliteFloodLayer visible={satelliteOn} imageUrl={satellite.imageUrl} coordinates={satelliteLayer?.coordinates ?? null} />
        <FloodPredictionLayer visible={floodPredictionOn} lgas={lgaLayer.data} predictions={floodPrediction.predictions} />
        <MapOverlayLayers
          palette={palette}
          roads={roadLayer.data}
          waterways={waterwayLayer.data}
          settlements={settlementLayer.data}
          infrastructure={infrastructureLayer.data}
          buildings={buildingLayer.data}
          wetlands={wetlandLayer.data}
        />
        <HouseholdLayer palette={palette} data={householdLayer.data} />
        <SurveyLayers palette={palette} floods={surveyData.floodExtents.data} drains={surveyData.drainage.data} />
        <FloodImpactLayer floodId={impactFloodId} />
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
            floodRisk={floodRiskOn ? clickedRisk : undefined}
            onSavePlace={canManagePlaces ? () => savedPlaces.openCreate(located.point!, describeWhere(located.result)) : undefined}
            onMarkHousehold={user ? () => households.openCreate(located.point!, describeWhere(located.result)) : undefined}
            here={here}
          />
        )}
        {households.selected && (
          <HouseholdPopup
            key={households.selected.id}
            household={households.selected}
            onEdit={() => households.openEdit(households.selected!)}
            onDelete={() => households.remove(households.selected!)}
            onClose={households.closeSelected}
          />
        )}
        {savedPlaces.selected && (
          <SavedPlacePopup
            place={savedPlaces.selected}
            onEdit={editableSelected ? () => savedPlaces.openEdit(savedPlaces.selected!) : undefined}
            onDelete={editableSelected ? () => savedPlaces.askRemove(savedPlaces.selected) : undefined}
            onClose={savedPlaces.closeSelected}
          >
            {(savedPlaces.selected.origin ?? "manual") === "manual" && (
              <PhotoSection subject={{ type: "place", id: savedPlaces.selected.id }} abilities={abilities} of={savedPlaces.selected.name ?? "the place"} />
            )}
          </SavedPlacePopup>
        )}
        <SurveyOnMap survey={survey} palette={palette} abilities={abilities} layerKey={markerKey} impactFloodId={impactFloodId} onToggleImpact={toggleImpact} />
        </Fragment>
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
        <LayerToggle layers={layerOptions} onChange={toggleLayer} base={base} onBaseChange={chooseBase} />
        {satelliteOn && (
          <SatelliteFloodPanel months={satellite.months} layer={satelliteLayer} onChoose={chooseFloodMonth} loading={satellite.loading} />
        )}
        <MapLegend items={legendItems} note={legendNote} collapsible />
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
          canAddPhotos={abilities.addPhotos}
          onDone={savedPlaces.finished}
        />
      )}
      <DeletePlaceDialog place={savedPlaces.removing} onClose={savedPlaces.closeRemove} onConfirm={savedPlaces.confirmRemove} />
      {households.form && <HouseholdFormDialog key={households.formKey} target={households.form} onClose={households.closeForm} onSubmit={households.submit} />}

      {canRecord && <FieldSurveyDock survey={survey} abilities={abilities} countryCode={country?.countryCode ?? null} onImported={survey.reload} />}
      <FieldSurveyForms survey={survey} abilities={abilities} />

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
