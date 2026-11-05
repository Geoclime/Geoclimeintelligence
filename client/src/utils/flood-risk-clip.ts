import type { MultiPolygon } from "geojson";
import type { ImageCorners } from "../types/flood-risk.types";

/**
 * Cutting the flood risk picture down to one area. The imported picture covers the whole state;
 * on an LGA's or ward's own page only that place's part should show. So the picture is cropped to
 * the area's bounding box and every pixel outside its boundary is made transparent, and the
 * smaller picture is pinned by its own corners.
 *
 * Mapbox stretches a picture across its four corners linearly in Web Mercator, so a longitude and
 * latitude map to a pixel (and back) with the same Mercator arithmetic the server used to draw it.
 */

const EARTH_RADIUS = 6378137;
const mercatorX = (lon: number) => (lon * Math.PI * EARTH_RADIUS) / 180;
const mercatorY = (lat: number) => EARTH_RADIUS * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const lonOfMercatorX = (x: number) => (x / EARTH_RADIUS) * (180 / Math.PI);
const latOfMercatorY = (y: number) => (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * (180 / Math.PI);

/** The part of the picture an area covers: whole pixels, and the area's rings in the picture's own pixel coordinates. */
export interface ClipWindow {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  rings: [number, number][][];
}

export interface ClippedPicture {
  imageUrl: string;
  coordinates: ImageCorners;
}

/** Where a longitude and latitude fall in a picture of `width` x `height` pinned by `coordinates`, in pixels. */
export function pixelOf(width: number, height: number, coordinates: ImageCorners, lon: number, lat: number): [number, number] {
  const [[west, north], [east], [, south]] = coordinates;
  const x = ((mercatorX(lon) - mercatorX(west)) / (mercatorX(east) - mercatorX(west))) * width;
  const y = ((mercatorY(north) - mercatorY(lat)) / (mercatorY(north) - mercatorY(south))) * height;
  return [x, y];
}

/** The pixels an area covers, with a pixel of margin for the soft edge; null when it is wholly outside the picture. */
export function clipWindow(width: number, height: number, coordinates: ImageCorners, geometry: MultiPolygon): ClipWindow | null {
  const rings = geometry.coordinates.flatMap((polygon) =>
    polygon.map((ring) => ring.map(([lon, lat]) => pixelOf(width, height, coordinates, lon!, lat!))),
  );
  const xs = rings.flatMap((ring) => ring.map(([x]) => x));
  const ys = rings.flatMap((ring) => ring.map(([, y]) => y));
  if (xs.length === 0) return null;
  const x0 = Math.max(0, Math.floor(Math.min(...xs)) - 1);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)) - 1);
  const x1 = Math.min(width, Math.ceil(Math.max(...xs)) + 1);
  const y1 = Math.min(height, Math.ceil(Math.max(...ys)) + 1);
  return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1, rings } : null;
}

/** The four corners (top-left, top-right, bottom-right, bottom-left) of a window of the picture. */
export function cornersOfWindow(width: number, height: number, coordinates: ImageCorners, window: Pick<ClipWindow, "x0" | "y0" | "x1" | "y1">): ImageCorners {
  const [[west, north], [east], [, south]] = coordinates;
  const x = (px: number) => mercatorX(west) + (px / width) * (mercatorX(east) - mercatorX(west));
  const y = (py: number) => mercatorY(north) - (py / height) * (mercatorY(north) - mercatorY(south));
  const lon = (px: number) => lonOfMercatorX(x(px));
  const lat = (py: number) => latOfMercatorY(y(py));
  return [
    [lon(window.x0), lat(window.y0)],
    [lon(window.x1), lat(window.y0)],
    [lon(window.x1), lat(window.y1)],
    [lon(window.x0), lat(window.y1)],
  ];
}

/**
 * Cuts the picture down to the area, in the browser. Pixels are copied one to one (no smoothing, so a
 * cell keeps its class colour), and only the boundary's own edge is anti-aliased. Null when the area
 * is outside the picture.
 */
export async function clipPicture(imageUrl: string, coordinates: ImageCorners, geometry: MultiPolygon): Promise<ClippedPicture | null> {
  const image = new Image();
  image.src = imageUrl;
  await image.decode();
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const window = clipWindow(width, height, coordinates, geometry);
  if (!window) return null;

  const canvas = document.createElement("canvas");
  canvas.width = window.x1 - window.x0;
  canvas.height = window.y1 - window.y0;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't draw the flood risk picture for one area.");

  context.beginPath();
  for (const ring of window.rings) {
    ring.forEach(([x, y], i) => (i === 0 ? context.moveTo(x - window.x0, y - window.y0) : context.lineTo(x - window.x0, y - window.y0)));
    context.closePath();
  }
  // Even-odd, so a hole in an area stays empty.
  context.clip("evenodd");
  context.imageSmoothingEnabled = false;
  context.drawImage(image, -window.x0, -window.y0);
  return { imageUrl: canvas.toDataURL("image/png"), coordinates: cornersOfWindow(width, height, coordinates, window) };
}
