import "mapbox-gl/dist/mapbox-gl.css";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Map, {
  AttributionControl,
  NavigationControl,
  ScaleControl,
  type MapEvent,
  type MapMouseEvent,
  type MapRef,
  type ViewStateChangeEvent,
} from "react-map-gl/mapbox";
import { env } from "../../config/env";
import type { ResolvedTheme } from "../../contexts/ThemeContext";
import type { BBox, LonLat } from "../../types/admin-unit.types";
import { Icon } from "../shared/Icon";
import { DEFAULT_VIEW, mapStyleUrl, padBBox } from "./map-style";
import { MapErrorBoundary } from "./MapErrorBoundary";
import "./map.css";

export interface MapView {
  bbox: BBox;
  zoom: number;
  longitude: number;
  latitude: number;
}

export interface InitialView {
  longitude: number;
  latitude: number;
  zoom: number;
}

interface ClimateMapProps {
  /** Describes the map for screen readers, e.g. "Map of Rivers State and its LGAs". */
  label: string;
  theme: ResolvedTheme;
  initialView?: InitialView;
  /** Fit the map to this box whenever it changes (e.g. once an area's extent is known). */
  fitTo?: BBox | null;
  /** Called once the map has loaded and after every pan or zoom. */
  onViewChange?: (view: MapView) => void;
  onMapClick?: (point: LonLat) => void;
  interactiveLayerIds?: string[];
  /** Map sources, layers and popups. */
  children?: ReactNode;
  /** Floating panels drawn over the map (layer switcher, legend...). */
  overlay?: ReactNode;
  className?: string;
  dataCy?: string;
}

function viewOf(event: MapEvent | ViewStateChangeEvent): MapView {
  const map = event.target;
  const bounds = map.getBounds();
  const center = map.getCenter();
  const bbox: BBox = bounds
    ? [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]
    : [center.lng - 1, center.lat - 1, center.lng + 1, center.lat + 1];
  return { bbox, zoom: map.getZoom(), longitude: center.lng, latitude: center.lat };
}

/**
 * The one map component every screen uses: Mapbox GL JS through react-map-gl (standard section
 * 10). Data is bound to native Source/Layer children, never to React markers. The token comes
 * from VITE_MAPBOX_TOKEN only. If there's no token, or the device can't run WebGL, a plain notice
 * replaces the map and the rest of the page keeps working.
 */
export function ClimateMap(props: ClimateMapProps) {
  const unavailable = (reason: string) => (
    <div className={`climate-map climate-map--unavailable ${props.className ?? ""}`} data-cy="map-unavailable" role="note">
      <Icon name="map" size={28} />
      <p className="climate-map__notice-title">Map unavailable</p>
      <p className="climate-map__notice-text">{reason}</p>
      {props.overlay}
    </div>
  );

  if (!env.VITE_MAPBOX_TOKEN) {
    return unavailable("No Mapbox token is configured (VITE_MAPBOX_TOKEN). The lists and details still work.");
  }
  return (
    <MapErrorBoundary fallback={unavailable("This device or browser can't draw the map (WebGL is unavailable).")}>
      <MapCanvas {...props} token={env.VITE_MAPBOX_TOKEN} />
    </MapErrorBoundary>
  );
}

function MapCanvas({
  label,
  theme,
  initialView = DEFAULT_VIEW,
  fitTo,
  onViewChange,
  onMapClick,
  interactiveLayerIds,
  children,
  overlay,
  className,
  dataCy,
  token,
}: ClimateMapProps & { token: string }) {
  const mapRef = useRef<MapRef>(null);
  const [loaded, setLoaded] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [cursor, setCursor] = useState<string>("");
  const fitKey = fitTo ? fitTo.join(",") : "";

  useEffect(() => {
    if (!loaded || !fitTo) return;
    mapRef.current?.fitBounds(padBBox(fitTo), { padding: 24, duration: 0 });
    // fitKey stands in for fitTo, whose identity changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, fitKey]);

  const handleLoad = useCallback(
    (event: MapEvent) => {
      setLoaded(true);
      onViewChange?.(viewOf(event));
    },
    [onViewChange],
  );

  const handleMoveEnd = useCallback((event: ViewStateChangeEvent) => onViewChange?.(viewOf(event)), [onViewChange]);

  const handleClick = useCallback(
    (event: MapMouseEvent) => onMapClick?.([event.lngLat.lng, event.lngLat.lat]),
    [onMapClick],
  );

  return (
    <div className={`climate-map ${className ?? ""}`} role="region" aria-label={label} data-cy={dataCy}>
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        initialViewState={initialView}
        mapStyle={mapStyleUrl(theme)}
        attributionControl={false}
        interactiveLayerIds={interactiveLayerIds}
        cursor={cursor || (onMapClick ? "crosshair" : "")}
        onMouseEnter={() => setCursor("pointer")}
        onMouseLeave={() => setCursor("")}
        onLoad={handleLoad}
        onMoveEnd={handleMoveEnd}
        onClick={onMapClick ? handleClick : undefined}
        onError={(event) => {
          // A bad or restricted token shows up as a 401 on the style or tiles.
          if (/401|403|access token/i.test(String(event.error?.message))) setTilesFailed(true);
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass={false} />
        <ScaleControl position="bottom-left" unit="metric" />
        <AttributionControl position="bottom-right" compact />
        {children}
      </Map>
      {tilesFailed && (
        <div className="climate-map__banner" role="alert">
          The base map couldn't load. Check that the Mapbox token is valid for this site.
        </div>
      )}
      {overlay}
    </div>
  );
}
