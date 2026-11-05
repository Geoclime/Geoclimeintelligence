import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { LonLat } from "../../types/admin-unit.types";
import type { MapPalette } from "./map-style";

interface PinLayerProps {
  point: LonLat;
  palette: MapPalette;
  /** A short name drawn above the pin ("Flood report"), for maps where it could be mistaken for something else. */
  label?: string;
}

/**
 * A pin on one spot: a halo and a dot, drawn as map layers rather than a DOM marker (standard
 * section 10). Marks where a flood report was sent from, on the map where someone chooses the
 * spot, the one a reviewer checks it on, and the full map a report links to.
 */
export function PinLayer({ point, palette, label }: PinLayerProps) {
  const data = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: point }, properties: { label: label ?? "" } }],
    }),
    [point, label],
  );

  return (
    <Source id="location-pin" type="geojson" data={data}>
      <Layer id="location-pin-halo" type="circle" paint={{ "circle-radius": 16, "circle-color": palette.selected, "circle-opacity": 0.25 }} />
      <Layer
        id="location-pin-dot"
        type="circle"
        paint={{ "circle-radius": 7, "circle-color": palette.selected, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 }}
      />
      {label && (
        <Layer
          id="location-pin-label"
          type="symbol"
          layout={{
            "text-field": ["get", "label"],
            "text-size": 12,
            "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
            "text-anchor": "bottom",
            "text-offset": [0, -1.3],
            "text-max-width": 12,
            "text-allow-overlap": true,
            "text-ignore-placement": true,
          }}
          paint={{ "text-color": palette.selected, "text-halo-color": palette.labelHalo, "text-halo-width": 2 }}
        />
      )}
    </Source>
  );
}
