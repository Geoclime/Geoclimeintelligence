import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/mapbox";
import type { LonLat } from "../../types/admin-unit.types";

/** Street level: close enough to see which road you are on. A map already zoomed in further is left as it is. */
const FOLLOW_MIN_ZOOM = 16;
const PAN_MS = 600;

/**
 * Keeps the map on the person as they walk. Mount it while the map should follow; it pans to each new
 * position without changing the zoom (apart from coming in to street level the first time). When the
 * person drags, pinches or scrolls the map themselves it calls `onRelease`, so the map never fights
 * their hand, and the caller stops mounting it. Draws nothing. Must sit inside <ClimateMap>.
 */
export function FollowCamera({ point, onRelease }: { point: LonLat; onRelease: () => void }) {
  const { current: map } = useMap();
  const releaseRef = useRef(onRelease);
  useEffect(() => {
    releaseRef.current = onRelease;
  });

  // Only a move the person made has an originalEvent; the camera's own pans do not.
  useEffect(() => {
    const mapbox = map?.getMap();
    if (!mapbox) return;
    const onMoveStart = (event: { originalEvent?: unknown }) => {
      if (event.originalEvent) releaseRef.current();
    };
    mapbox.on("movestart", onMoveStart);
    return () => {
      mapbox.off("movestart", onMoveStart);
    };
  }, [map]);

  const [longitude, latitude] = point;
  useEffect(() => {
    const mapbox = map?.getMap();
    if (!mapbox) return;
    mapbox.easeTo({ center: [longitude, latitude], zoom: Math.max(mapbox.getZoom(), FOLLOW_MIN_ZOOM), duration: PAN_MS });
  }, [map, longitude, latitude]);

  return null;
}
