import { Fragment, useMemo, useState } from "react";
import { useAdminUnits } from "../../hooks/useAdminUnits";
import { useMapLayers } from "../../hooks/useMapLayers";
import { useTheme } from "../../hooks/useTheme";
import type { BBox, LonLat } from "../../types/admin-unit.types";
import { formatCoordinates } from "../../utils/formatCoordinates";
import { AdminBoundaryLayers } from "../map/AdminBoundaryLayers";
import { ClimateMap, type MapView } from "../map/ClimateMap";
import { mapPalette } from "../map/map-style";
import { MapOverlayLayers } from "../map/MapOverlayLayers";
import { PinLayer } from "../map/PinLayer";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { LayerSwitches, MapTypeToggle } from "./ReportMapControls";
import { useReportMapLayers } from "./report-map-layers";
import "./reports.css";

interface LocationPickerProps {
  point: LonLat | null;
  /** Where the map should show; set when the point comes from GPS, not from a tap (so taps don't jump the map). */
  focus: BBox | null;
  onPick: (point: LonLat) => void;
  onLocate: () => void;
  locating: boolean;
  error: string | null;
}

/** The zoom the map opens at with no pin yet: wide enough to see the neighbouring LGAs and their names. */
const OVERVIEW_ZOOM = 9;
/** Street level, where roads, buildings and facility names are all drawn. */
const STREET_ZOOM = 16;

/**
 * Where the flooding is. The device's GPS position is used first; tap the map to move the pin
 * (the pin is a map layer, not a DOM marker: standard section 10). Without a map, the GPS button
 * and the coordinates still work.
 *
 * The map draws what the platform's own map draws, so the reporter can recognise where they are
 * and place the pin on the right street: LGA names and ward and LGA boundaries, settlements,
 * facilities, roads with their names, waterways, wetlands and buildings. Each has a switch, and
 * Satellite shows the ground itself. The pin sits on top of all of it.
 */
export function LocationPicker({ point, focus, onPick, onLocate, locating, error }: LocationPickerProps) {
  const { resolved: theme } = useTheme();
  const { satellite, layers, chooseSatellite, toggle } = useReportMapLayers();
  const [view, setView] = useState<MapView | null>(null);
  // The pin's amber reads on imagery in either theme; the light theme's brown does not.
  const palette = useMemo(() => mapPalette(satellite ? "dark" : theme), [satellite, theme]);
  const data = useMapLayers(view?.bbox ?? null, view?.zoom ?? OVERVIEW_ZOOM, layers);
  // The same list the full map labels the LGAs from; reference data, so it is remembered rather than refetched.
  const { units: lgaList } = useAdminUnits({ level: 2, pageSize: 100 });

  return (
    <div className="location-picker" data-cy="location-picker">
      <ClimateMap
        label="Map for choosing where the flooding is. Tap to move the pin."
        theme={theme}
        satellite={satellite}
        initialView={{ longitude: point?.[0] ?? 7.0, latitude: point?.[1] ?? 4.82, zoom: point ? STREET_ZOOM : OVERVIEW_ZOOM }}
        fitTo={focus}
        onViewChange={setView}
        onMapClick={onPick}
        className="location-picker__map"
      >
        {/* Keyed by the base map and theme: a new style drops every layer, and remounting adds them back in this order. */}
        <Fragment key={`${satellite ? "satellite" : "streets"}-${palette.name}`}>
          <MapOverlayLayers
            palette={palette}
            roads={data.roads.data}
            waterways={data.waterways.data}
            settlements={data.settlements.data}
            infrastructure={data.infrastructure.data}
            buildings={data.buildings.data}
            wetlands={data.wetlands.data}
          />
          <AdminBoundaryLayers
            palette={palette}
            state={data.state.data}
            lgas={data.lga.data}
            wards={data.ward.data}
            lgaLabels={layers.lga ? lgaList : []}
            selectedLgaId={null}
          />
          {/* Remounted as a boundary layer appears, so the pin is added after it and drawn on top. */}
          {point && <PinLayer key={[data.state.data, data.lga.data, data.ward.data].map(Boolean).join()} point={point} palette={palette} />}
        </Fragment>
      </ClimateMap>
      {/* Only once the map has drawn: with no map (no token, or no WebGL) there is nothing for these to switch. */}
      {view && (
        <div className="location-picker__tools">
          <MapTypeToggle satellite={satellite} onChoose={chooseSatellite} dataCyPrefix="picker-map" />
          <LayerSwitches layers={layers} onToggle={toggle} loading={data.loading} failed={Boolean(data.error)} dataCyPrefix="picker-map" />
        </div>
      )}
      <div className="location-picker__bar">
        <span className="location-picker__coords mono" aria-live="polite">
          {point ? formatCoordinates(point) : "No location yet"}
        </span>
        <Button variant="secondary" size="sm" icon={<Icon name="crosshair" size={14} />} onClick={onLocate} loading={locating} loadingLabel="Locating…" data-cy="report-locate">
          Use my location
        </Button>
      </div>
      <p className="location-picker__hint">{error ?? "Your GPS position is used first. Tap the map to move the pin if it's not quite right."}</p>
    </div>
  );
}
