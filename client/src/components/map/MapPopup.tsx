import { useEffect, type ReactNode } from "react";
import { Popup, useMap } from "react-map-gl/mapbox";
import type { LonLat } from "../../types/admin-unit.types";

/** The width below which a popup is a card along the bottom of the map instead of a bubble at its point. Mirrors the CSS in map.css. */
const PHONE = "(max-width: 639px)";

interface MapPopupProps {
  /** What the popup is about. */
  point: LonLat;
  /** Gap between the point and the bubble, in pixels (desktop only). */
  offset: number;
  /** The widest the bubble gets on a larger screen; it is never wider than the screen. */
  maxWidth: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The one popup every map popup is built on (a place, an LGA lookup, a household, a flood, a drain).
 *
 * On a larger screen it is a bubble at its point, on whichever side fits. On a phone a bubble can't be
 * read: it is wider than the room beside a point near the edge, and it hides the map it describes. So there
 * (map.css, `.map-popup`) it is a card along the bottom of the map, as full-width as the screen allows and
 * scrolling if it is tall, with the map above it. The point it is about is brought up above the card, so
 * it is never hidden behind it.
 */
export function MapPopup({ point, offset, maxWidth, onClose, children }: MapPopupProps) {
  const { current: map } = useMap();
  const [longitude, latitude] = point;

  useEffect(() => {
    if (!map || !window.matchMedia?.(PHONE).matches || map.isMoving()) return;
    const height = map.getContainer().clientHeight;
    // The card covers the lower part of the map: a point down there moves up to the top quarter.
    if (map.project([longitude, latitude]).y > height * 0.4) {
      map.easeTo({ center: [longitude, latitude], offset: [0, -height * 0.25], duration: 250 });
    }
  }, [map, longitude, latitude]);

  return (
    <Popup
      longitude={longitude}
      latitude={latitude}
      offset={offset}
      maxWidth={`min(${maxWidth}, calc(100vw - 2rem))`}
      closeOnClick={false}
      onClose={onClose}
      className="admin-unit-popup map-popup"
    >
      {children}
    </Popup>
  );
}
