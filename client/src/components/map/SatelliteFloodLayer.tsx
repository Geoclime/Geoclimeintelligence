import { memo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { ImageCorners } from "../../types/flood-risk.types";
import { EMPTY_IMAGE, PARKED_CORNERS } from "../../utils/flood-risk";

/** Enough to see the land under the water, and the flood risk colours under that. */
export const SATELLITE_FLOOD_OPACITY = 0.85;

interface SatelliteFloodLayerProps {
  visible: boolean;
  /** The chosen month's picture, once it has arrived. */
  imageUrl: string | null;
  coordinates: ImageCorners | null;
}

/**
 * One month of water seen by Sentinel-1: the stored mask pinned to the map by its four corners, as a
 * native Mapbox image source, like the flood risk surface. It is mounted right after that surface and
 * never unmounted, so it sits above it and under the roads, waterways and boundaries that mount later.
 * Choosing another month swaps the picture in place, which keeps that place. `nearest` keeps each
 * pixel (about 38 m) a crisp block rather than a blur that suggests more precision than there is.
 */
export const SatelliteFloodLayer = memo(function SatelliteFloodLayer({ visible, imageUrl, coordinates }: SatelliteFloodLayerProps) {
  const ready = imageUrl !== null && coordinates !== null;
  return (
    <Source id="satellite-flood" type="image" url={imageUrl ?? EMPTY_IMAGE} coordinates={coordinates ?? PARKED_CORNERS}>
      <Layer
        id="satellite-flood-raster"
        type="raster"
        layout={{ visibility: visible && ready ? "visible" : "none" }}
        paint={{ "raster-opacity": SATELLITE_FLOOD_OPACITY, "raster-resampling": "nearest" }}
      />
    </Source>
  );
});
