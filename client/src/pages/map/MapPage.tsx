import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AdminBoundaryLayers } from "../../components/map/AdminBoundaryLayers";
import { AdminUnitPopup } from "../../components/map/AdminUnitPopup";
import { ClimateMap, type MapView } from "../../components/map/ClimateMap";
import { LayerToggle, type LayerOption } from "../../components/map/LayerToggle";
import { MapLayerSources } from "../../components/map/MapLayerSources";
import { MapLegend } from "../../components/map/MapLegend";
import { MapOverlayLayers } from "../../components/map/MapOverlayLayers";
import { MapOverviewPanel } from "../../components/map/MapOverviewPanel";
import {
  BUILDING_MIN_ZOOM,
  INTERACTIVE_LAYERS,
  mapPalette,
  OVERLAY_LAYER_IDS,
  WARD_MIN_ZOOM,
  type MapLayerId,
} from "../../components/map/map-style";
import { Button, buttonClassName } from "../../components/shared/Button";
import { EmptyState } from "../../components/shared/EmptyState";
import { Icon } from "../../components/shared/Icon";
import { useAdminUnitLayer } from "../../hooks/useAdminUnitLayer";
import { useAdminUnits } from "../../hooks/useAdminUnits";
import { useAuth } from "../../hooks/useAuth";
import { useCountries } from "../../hooks/useCountries";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useGeolocation } from "../../hooks/useGeolocation";
import { useLocatePoint } from "../../hooks/useLocatePoint";
import { useMapLayer } from "../../hooks/useMapLayer";
import { useMapLayerCatalog } from "../../hooks/useMapLayerCatalog";
import { useTheme } from "../../hooks/useTheme";
import type { BBox, LonLat } from "../../types/admin-unit.types";
import { readLayers, readMapView, writeLayers, writeMapView } from "../../utils/map-url";
import { overlayHint } from "../../utils/overlay-layers";
import { hasAnyRole } from "../../utils/roles";
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

  const layers = readLayers(searchParams);
  const selectedLgaId = searchParams.get("lga");
  const zoom = view?.zoom ?? initialView?.zoom ?? 8;

  const { countries, loading: countriesLoading } = useCountries();
  const { units: states } = useAdminUnits({ level: 1, pageSize: 10 });
  const { units: lgaList } = useAdminUnits({ level: 2, pageSize: 100 });
  const stateLayer = useAdminUnitLayer(view?.bbox ?? null, 1, { enabled: layers.state, zoom });
  const lgaLayer = useAdminUnitLayer(view?.bbox ?? null, 2, { enabled: layers.lga, zoom });
  const wardLayer = useAdminUnitLayer(view?.bbox ?? null, 3, { enabled: layers.ward && zoom >= WARD_MIN_ZOOM, zoom });
  const roadLayer = useMapLayer("roads", view?.bbox ?? null, { enabled: layers.roads, zoom });
  const waterwayLayer = useMapLayer("waterways", view?.bbox ?? null, { enabled: layers.waterways, zoom });
  const settlementLayer = useMapLayer("settlements", view?.bbox ?? null, { enabled: layers.settlements, zoom });
  const infrastructureLayer = useMapLayer("infrastructure", view?.bbox ?? null, { enabled: layers.infrastructure, zoom });
  const buildingLayer = useMapLayer("buildings", view?.bbox ?? null, { enabled: layers.buildings && zoom >= BUILDING_MIN_ZOOM, zoom });
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

  const handleMapClick = useCallback(
    async (point: LonLat) => {
      const result = await located.locate(point);
      const lga = result?.units.find((unit) => unit.level === 2);
      if (lga) selectLga(lga.id);
    },
    [located, selectLga],
  );

  const whereAmI = async () => {
    const point = await geolocation.request();
    if (!point) return;
    setFocus([point[0] - 0.02, point[1] - 0.02, point[0] + 0.02, point[1] + 0.02]);
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
  ];
  const legendItems = [...LEGEND, ...OVERLAY_LEGEND.filter((item) => layers[item.layer])];
  const visibleOverlays = OVERLAY_LAYER_IDS.filter((id) => layers[id]);

  const noCountry = !countriesLoading && countries.length === 0;
  const layerError =
    stateLayer.error ??
    lgaLayer.error ??
    wardLayer.error ??
    roadLayer.error ??
    waterwayLayer.error ??
    settlementLayer.error ??
    infrastructureLayer.error ??
    buildingLayer.error;

  return (
    <div className="map-page" data-cy="map-page">
      <ClimateMap
        label="Map of the states on the platform, their local government areas and wards"
        theme={theme}
        initialView={initialView ?? undefined}
        fitTo={focus ?? (initialView ? null : (stateUnit?.bbox ?? null))}
        onViewChange={handleViewChange}
        onMapClick={(point) => void handleMapClick(point)}
        interactiveLayerIds={INTERACTIVE_LAYERS}
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
        <AdminBoundaryLayers
          palette={palette}
          state={stateLayer.data}
          lgas={lgaLayer.data}
          wards={wardLayer.data}
          lgaLabels={layers.lga ? lgaList : []}
          selectedLgaId={selectedLgaId}
        />
        {located.point && (
          <AdminUnitPopup
            point={located.point}
            result={located.result}
            loading={located.loading}
            error={located.error}
            onClose={located.clear}
          />
        )}
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
        {layerError && (
          <p className="map-panel map-page__error" role="alert" data-cy="layer-error">
            Some map layers couldn't load: {layerError}
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
