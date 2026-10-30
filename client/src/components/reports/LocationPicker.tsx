import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import { useTheme } from "../../hooks/useTheme";
import type { BBox, LonLat } from "../../types/admin-unit.types";
import { formatCoordinates } from "../../utils/formatCoordinates";
import { ClimateMap } from "../map/ClimateMap";
import { mapPalette } from "../map/map-style";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
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

/**
 * Where the flooding is. The device's GPS position is used first; tap the map to move the pin
 * (the pin is a map layer, not a DOM marker: standard section 10). Without a map, the GPS button
 * and the coordinates still work.
 */
export function LocationPicker({ point, focus, onPick, onLocate, locating, error }: LocationPickerProps) {
  const { resolved: theme } = useTheme();
  const palette = useMemo(() => mapPalette(theme), [theme]);
  const pin = useMemo(
    () => (point ? { type: "FeatureCollection" as const, features: [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: point }, properties: {} }] } : null),
    [point],
  );

  return (
    <div className="location-picker" data-cy="location-picker">
      <ClimateMap
        label="Map for choosing where the flooding is. Tap to move the pin."
        theme={theme}
        initialView={{ longitude: point?.[0] ?? 7.0, latitude: point?.[1] ?? 4.82, zoom: point ? 16 : 9 }}
        fitTo={focus}
        onMapClick={onPick}
        className="location-picker__map"
      >
        {pin && (
          <Source id="report-pin" type="geojson" data={pin}>
            <Layer id="report-pin-halo" type="circle" paint={{ "circle-radius": 16, "circle-color": palette.selected, "circle-opacity": 0.2 }} />
            <Layer
              id="report-pin-dot"
              type="circle"
              paint={{ "circle-radius": 7, "circle-color": palette.selected, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 }}
            />
          </Source>
        )}
      </ClimateMap>
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
