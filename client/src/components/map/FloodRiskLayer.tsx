import { memo } from "react";
import { Layer, Source } from "react-map-gl/mapbox";
import type { ImageCorners } from "../../types/flood-risk.types";
import { EMPTY_IMAGE, FLOOD_RISK_OPACITY, PARKED_CORNERS } from "../../utils/flood-risk";

interface FloodRiskLayerProps {
  /** Switched on by the person looking at the map. */
  visible: boolean;
  /** The imported picture, once it has arrived. */
  imageUrl: string | null;
  /** Where to pin it: Mapbox's four corners. */
  coordinates: ImageCorners | null;
}

/**
 * The flood risk surface: the imported picture pinned to the map by its four corners, as a native
 * Mapbox image source (standard section 10). It is mounted first and never unmounted, hidden with
 * `visibility` until the picture is there and the layer is on, so it always sits under the roads,
 * waterways and boundaries that mount after it (Mapbox stacks layers in the order they were added).
 * When the picture arrives the source is updated in place, which keeps that place.
 *
 * `nearest` resampling keeps each 100 m cell a crisp block when zoomed in, instead of blending a
 * "low" and a "high" cell into a "moderate" colour that no cell has.
 */
export const FloodRiskLayer = memo(function FloodRiskLayer({ visible, imageUrl, coordinates }: FloodRiskLayerProps) {
  const ready = imageUrl !== null && coordinates !== null;
  return (
    <Source id="flood-risk" type="image" url={imageUrl ?? EMPTY_IMAGE} coordinates={coordinates ?? PARKED_CORNERS}>
      <Layer
        id="flood-risk-raster"
        type="raster"
        layout={{ visibility: visible && ready ? "visible" : "none" }}
        paint={{ "raster-opacity": FLOOD_RISK_OPACITY, "raster-resampling": "nearest" }}
      />
    </Source>
  );
});
