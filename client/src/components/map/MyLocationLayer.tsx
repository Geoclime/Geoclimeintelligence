import type { ExpressionSpecification } from "mapbox-gl";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { GeolocationFix } from "../../hooks/useGeolocation";
import type { MapPalette } from "./map-style";

/** Metres per pixel on the equator at zoom 0, for the 512 px tiles Mapbox GL draws. */
const METRES_PER_PIXEL_AT_ZOOM_0 = 78_271.517;
const MAX_ZOOM = 22;
/** A fix looser than this says little about where someone is, so the ring is left off rather than shown as a blot. */
const MAX_RING_METRES = 3_000;

/**
 * "You are here": the blue dot with a white edge that every map app uses for the viewer, a soft ring
 * for how sure the device is (its accuracy, scaled to metres on the ground, so it grows as you zoom
 * in), and a label. Blue and labelled so it can't be taken for the amber pin of a flood report.
 * Drawn as map layers rather than a DOM marker (standard section 10).
 */
export function MyLocationLayer({ fix, palette }: { fix: GeolocationFix; palette: MapPalette }) {
  const [, latitude] = fix.point;
  const data = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: [{ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: fix.point }, properties: { label: "You are here" } }],
    }),
    [fix.point],
  );

  // Pixels per metre doubles with every zoom level, so the ring is exact at zoom 0 and zoom 22 and
  // interpolated exponentially (base 2) between them.
  const pixelsAtZoom0 = fix.accuracy / (METRES_PER_PIXEL_AT_ZOOM_0 * Math.cos((latitude * Math.PI) / 180));
  const ringRadius = ["interpolate", ["exponential", 2], ["zoom"], 0, pixelsAtZoom0, MAX_ZOOM, pixelsAtZoom0 * 2 ** MAX_ZOOM] as unknown as ExpressionSpecification;
  const showRing = fix.accuracy > 0 && fix.accuracy <= MAX_RING_METRES;

  return (
    <Source id="my-location" type="geojson" data={data}>
      {showRing && (
        <Layer
          id="my-location-accuracy"
          type="circle"
          paint={{ "circle-radius": ringRadius, "circle-color": palette.you, "circle-opacity": 0.14, "circle-stroke-color": palette.you, "circle-stroke-opacity": 0.4, "circle-stroke-width": 1 }}
        />
      )}
      <Layer id="my-location-halo" type="circle" paint={{ "circle-radius": 15, "circle-color": palette.you, "circle-opacity": 0.25 }} />
      <Layer
        id="my-location-dot"
        type="circle"
        paint={{ "circle-radius": 7.5, "circle-color": palette.you, "circle-stroke-color": "#ffffff", "circle-stroke-width": 3 }}
      />
      <Layer
        id="my-location-label"
        type="symbol"
        layout={{
          "text-field": ["get", "label"],
          "text-size": 12,
          "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
          "text-anchor": "top",
          "text-offset": [0, 1.4],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        }}
        paint={{ "text-color": palette.you, "text-halo-color": palette.labelHalo, "text-halo-width": 2 }}
      />
    </Source>
  );
}
