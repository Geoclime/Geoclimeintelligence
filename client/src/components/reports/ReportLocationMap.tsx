import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useMapLayers } from "../../hooks/useMapLayers";
import { useTheme } from "../../hooks/useTheme";
import type { LonLat } from "../../types/admin-unit.types";
import { MAP_PATH, writeMapView, writePin } from "../../utils/map-url";
import { AdminBoundaryLayers } from "../map/AdminBoundaryLayers";
import { ClimateMap, type MapView } from "../map/ClimateMap";
import { mapPalette, type MapLayerId } from "../map/map-style";
import { MapOverlayLayers } from "../map/MapOverlayLayers";
import { PinLayer } from "../map/PinLayer";
import { buttonClassName } from "../shared/Button";
import { Icon } from "../shared/Icon";
import "../map/map.css";
import "./reports.css";

/** Street level: close enough to tell a road from a river, and which side of it the water is. */
const ZOOM = 16;

/** The switches under the map: what each one turns on, and the legend swatch that goes with it. */
const LAYER_SWITCHES: { label: string; swatch: string; layers: MapLayerId[] }[] = [
  { label: "Boundaries", swatch: "lga", layers: ["state", "lga", "ward"] },
  { label: "Waterways", swatch: "waterways", layers: ["waterways"] },
  { label: "Roads", swatch: "roads", layers: ["roads"] },
  { label: "Buildings", swatch: "buildings", layers: ["buildings"] },
  { label: "Facilities", swatch: "facility-health", layers: ["infrastructure"] },
  { label: "Settlements", swatch: "settlements", layers: ["settlements"] },
];

const ALL_LAYERS: Record<MapLayerId, boolean> = {
  state: true,
  lga: true,
  ward: true,
  roads: true,
  waterways: true,
  settlements: true,
  infrastructure: true,
  buildings: true,
};

interface ReportLocationMapProps {
  point: LonLat;
  placeName: string;
  /** The LGA the report was placed in, outlined so a reviewer can see the pin is really inside it. */
  lgaId?: string | null;
}

/**
 * Where a flood report was sent from, on a small map under the report, so a reviewer can check the
 * spot before publishing without leaving the queue. It draws what the platform's own map draws
 * (boundaries with the report's LGA outlined, waterways, roads, buildings, facilities, settlements),
 * each with a switch. Satellite shows the ground itself, and puts the building shapes away since
 * the photograph already shows them. The links open the same spot on the full map or in Google
 * Maps, in a new tab so the queue stays where it was.
 */
export function ReportLocationMap({ point, placeName, lgaId = null }: ReportLocationMapProps) {
  const { resolved: theme } = useTheme();
  const [satellite, setSatellite] = useState(false);
  const [layers, setLayers] = useState<Record<MapLayerId, boolean>>(ALL_LAYERS);
  const [view, setView] = useState<MapView | null>(null);
  // The pin's amber reads on imagery in either theme; the light theme's brown does not.
  const palette = useMemo(() => mapPalette(satellite ? "dark" : theme), [satellite, theme]);
  const data = useMapLayers(view?.bbox ?? null, view?.zoom ?? ZOOM, layers);
  const [longitude, latitude] = point;
  const platformMap = `${MAP_PATH}?${writePin(writeMapView(new URLSearchParams(), { longitude, latitude, zoom: ZOOM + 1 }), point, "Flood report")}`;
  const googleMaps = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  const chooseSatellite = (next: boolean) => {
    setSatellite(next);
    setLayers((current) => ({ ...current, buildings: !next }));
  };
  const toggle = (ids: MapLayerId[], checked: boolean) => setLayers((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, checked])) }));

  return (
    <div className="report-map" data-cy="report-map">
      <ClimateMap
        label={`Map showing where the report was sent from: ${placeName}`}
        theme={theme}
        satellite={satellite}
        initialView={{ longitude, latitude, zoom: ZOOM }}
        onViewChange={setView}
        className="report-map__canvas"
        dataCy="report-map-canvas"
      >
        <MapOverlayLayers
          palette={palette}
          roads={data.roads.data}
          waterways={data.waterways.data}
          settlements={data.settlements.data}
          infrastructure={data.infrastructure.data}
          buildings={data.buildings.data}
        />
        <AdminBoundaryLayers palette={palette} state={data.state.data} lgas={data.lga.data} wards={data.ward.data} lgaLabels={[]} selectedLgaId={lgaId} />
        {/* Remounted as a boundary layer appears, so the pin is added after it and drawn on top. */}
        <PinLayer key={[data.state.data, data.lga.data, data.ward.data].map(Boolean).join()} point={point} palette={palette} />
      </ClimateMap>

      <div className="report-map__layers" role="group" aria-label="What to show on the map" data-cy="report-map-layers">
        {LAYER_SWITCHES.map(({ label, swatch, layers: ids }) => (
          <label key={label} className="report-map__layer">
            <input type="checkbox" checked={ids.every((id) => layers[id])} onChange={(event) => toggle(ids, event.target.checked)} />
            <span className={`map-legend__swatch map-legend__swatch--${swatch}`} aria-hidden="true" />
            {label}
          </label>
        ))}
        <span className="report-map__status" role="status">
          {data.error ? "Some layers couldn't load." : data.loading ? "Loading layers…" : ""}
        </span>
      </div>

      <div className="report-map__bar">
        <div className="segmented" role="group" aria-label="Map type">
          <button type="button" aria-pressed={!satellite} onClick={() => chooseSatellite(false)} data-cy="report-map-streets">
            Map
          </button>
          <button type="button" aria-pressed={satellite} onClick={() => chooseSatellite(true)} data-cy="report-map-satellite">
            Satellite
          </button>
        </div>
        <div className="report-map__links">
          <Link to={platformMap} target="_blank" rel="noreferrer" className={buttonClassName({ variant: "ghost", size: "sm" })} data-cy="report-map-full">
            <Icon name="map" size={14} />
            <span>Open on the full map</span>
          </Link>
          <a href={googleMaps} target="_blank" rel="noreferrer" className={buttonClassName({ variant: "ghost", size: "sm" })} data-cy="report-map-google">
            <Icon name="externalLink" size={14} />
            <span>Google Maps</span>
          </a>
        </div>
      </div>
    </div>
  );
}
