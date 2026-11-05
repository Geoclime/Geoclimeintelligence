import type { MultiPolygon } from "geojson";
import type { BBox, LonLat } from "../types/admin-unit.types";

/** A drawing area fitted to a bbox: its size in SVG units, and how to place a coordinate in it. */
export interface OutlineFrame {
  width: number;
  height: number;
  project: (point: LonLat) => [number, number];
}

/**
 * Fits a bbox into a drawing `width` units wide, keeping its true shape. Near the equator a
 * plain lon/lat grid (scaled by the cosine of the middle latitude) is accurate to well under a
 * pixel at this size, so no map projection library is needed for a decorative outline.
 */
export function outlineFrame(bbox: BBox, width: number, padding = 0): OutlineFrame {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const xScale = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = Math.max((maxLon - minLon) * xScale, 1e-9);
  const spanY = Math.max(maxLat - minLat, 1e-9);
  const k = (width - padding * 2) / spanX;
  const height = spanY * k + padding * 2;
  return {
    width,
    height: Math.round(height * 10) / 10,
    project: ([lon, lat]) => [padding + (lon - minLon) * xScale * k, padding + (maxLat - lat) * k],
  };
}

const fixed = (n: number) => (Math.round(n * 10) / 10).toString();

/** An SVG path for a MultiPolygon, one closed sub-path per ring (holes included, drawn even-odd). */
export function multiPolygonPath(geometry: MultiPolygon, frame: OutlineFrame): string {
  return geometry.coordinates
    .flatMap((polygon) => polygon)
    .filter((ring) => ring.length >= 3)
    .map((ring) => {
      const points = ring.map((position) => frame.project([position[0]!, position[1]!]));
      return `M${points.map(([x, y]) => `${fixed(x)},${fixed(y)}`).join("L")}Z`;
    })
    .join("");
}
