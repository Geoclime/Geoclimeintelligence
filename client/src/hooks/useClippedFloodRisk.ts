import type { MultiPolygon } from "geojson";
import { useEffect, useState } from "react";
import type { ImageCorners } from "../types/flood-risk.types";
import { clipPicture, type ClippedPicture } from "../utils/flood-risk-clip";

interface Clipped {
  imageUrl: string;
  geometry: MultiPolygon;
  picture: ClippedPicture | null;
}

/**
 * The flood risk picture cut down to one area (utils/flood-risk-clip.ts): only that place's part, the
 * rest transparent. It is `null` until it is ready (and for an area outside the picture), so the
 * caller draws nothing meanwhile rather than the whole state's picture for a moment.
 */
export function useClippedFloodRisk(imageUrl: string | null, coordinates: ImageCorners | null, geometry: MultiPolygon | null) {
  const [done, setDone] = useState<Clipped | null>(null);

  useEffect(() => {
    if (!imageUrl || !coordinates || !geometry) return;
    let cancelled = false;
    // An answer for an older picture or area is never shown for a newer one (see `current` below).
    clipPicture(imageUrl, coordinates, geometry).then(
      (picture) => !cancelled && setDone({ imageUrl, geometry, picture }),
      () => !cancelled && setDone({ imageUrl, geometry, picture: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [imageUrl, coordinates, geometry]);

  const current = done && done.imageUrl === imageUrl && done.geometry === geometry ? done.picture : null;
  return { imageUrl: current?.imageUrl ?? null, coordinates: current?.coordinates ?? null };
}
