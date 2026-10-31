import { useMemo } from "react";
import { useTheme } from "../../hooks/useTheme";
import type { BBox, LonLat } from "../../types/admin-unit.types";
import { formatCoordinates } from "../../utils/formatCoordinates";
import { ClimateMap } from "../map/ClimateMap";
import { mapPalette } from "../map/map-style";
import { PinLayer } from "../map/PinLayer";
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
        {point && <PinLayer point={point} palette={palette} />}
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
