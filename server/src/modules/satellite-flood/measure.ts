import type { MultiPolygon, Polygon } from "geojson";
import { encodeMaskPng } from "./png-codec";
import { WATER_COLOUR, type AreaWater, type FloodMosaic, type MaskImage } from "./satellite-flood.types";
import { latOfPixel, pixelMetresAt, pixelX, pixelY, worldPixels } from "./web-mercator";

/**
 * The largest side the map's picture may have. Many phones can't draw a picture wider or taller
 * than 4,096 pixels; Rivers State at zoom 12 is about 4,110 tall, so it is shrunk by well under 1%.
 */
export const MAX_IMAGE_SIDE = 4096;

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Measures how much of an area was water: it fills the shape one row of pixels at a time (the
 * even-odd rule over every ring, so holes are left out), and a pixel belongs to the area when its
 * centre does, so neighbouring areas never share a pixel. Each pixel counts its true ground area,
 * which shrinks with latitude on the Web Mercator grid.
 *
 * `covered`, when given, is marked 1 for every pixel the area contains, so a caller can tell how
 * much of the water lies outside every area.
 */
export function measureWater(mosaic: FloodMosaic, geometry: Polygon | MultiPolygon, covered?: Uint8Array): AreaWater {
  const { width, height, mask, originX, originY } = mosaic;
  const world = worldPixels(mosaic.zoom, mosaic.tileSize);
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let flooded = 0;
  let measured = 0;

  for (const rings of polygons) {
    const xs1: number[] = [];
    const ys1: number[] = [];
    const xs2: number[] = [];
    const ys2: number[] = [];
    let minY = Infinity;
    let maxY = -Infinity;
    for (const ring of rings) {
      const points = ring.map(([lon, lat]) => [pixelX(lon!, world) - originX, pixelY(lat!, world) - originY] as const);
      for (let i = 1; i < points.length; i++) {
        const [x1, y1] = points[i - 1]!;
        const [x2, y2] = points[i]!;
        xs1.push(x1);
        ys1.push(y1);
        xs2.push(x2);
        ys2.push(y2);
        minY = Math.min(minY, y1, y2);
        maxY = Math.max(maxY, y1, y2);
      }
    }
    if (xs1.length === 0) continue;

    const firstRow = Math.max(0, Math.floor(minY - 0.5));
    const lastRow = Math.min(height - 1, Math.ceil(maxY - 0.5));
    const crossings: number[] = [];
    for (let row = firstRow; row <= lastRow; row++) {
      const y = row + 0.5;
      crossings.length = 0;
      for (let e = 0; e < xs1.length; e++) {
        const y1 = ys1[e]!;
        const y2 = ys2[e]!;
        // Half-open, so a vertex exactly on the row's centre line is crossed once, not twice.
        if ((y1 <= y) !== (y2 <= y)) crossings.push(xs1[e]! + ((y - y1) * (xs2[e]! - xs1[e]!)) / (y2 - y1));
      }
      if (crossings.length < 2) continue;
      crossings.sort((a, b) => a - b);
      const side = pixelMetresAt(latOfPixel(originY + y, world), world);
      const pixelKm2 = (side * side) / 1e6;
      let rowWater = 0;
      let rowPixels = 0;
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const from = Math.max(0, Math.ceil(crossings[k]! - 0.5));
        const to = Math.min(width - 1, Math.ceil(crossings[k + 1]! - 0.5) - 1);
        for (let col = from; col <= to; col++) {
          const at = row * width + col;
          if (covered) covered[at] = 1;
          rowPixels++;
          rowWater += mask[at]!;
        }
      }
      flooded += rowWater * pixelKm2;
      measured += rowPixels * pixelKm2;
    }
  }
  return { floodedKm2: round3(flooded), measuredKm2: round3(measured) };
}

/** The ground area of every water pixel, in km2. */
export function waterKm2(mosaic: FloodMosaic, include: (index: number) => boolean = () => true): number {
  const world = worldPixels(mosaic.zoom, mosaic.tileSize);
  let total = 0;
  for (let row = 0; row < mosaic.height; row++) {
    const side = pixelMetresAt(latOfPixel(mosaic.originY + row + 0.5, world), world);
    let count = 0;
    for (let col = 0; col < mosaic.width; col++) {
      const at = row * mosaic.width + col;
      if (mosaic.mask[at] && include(at)) count++;
    }
    total += (count * side * side) / 1e6;
  }
  return round3(total);
}

/** Roughly how many metres a pixel of the picture is, at the middle of the mosaic. */
export function imagePixelMetres(mosaic: FloodMosaic, imageWidth: number): number {
  const world = worldPixels(mosaic.zoom, mosaic.tileSize);
  const middle = latOfPixel(mosaic.originY + mosaic.height / 2, world);
  return Math.round(pixelMetresAt(middle, world) * (mosaic.width / imageWidth) * 10) / 10;
}

/**
 * The picture the map draws: the mask as a 1-bit PNG, already on the Web Mercator grid, so its four
 * corners pin it exactly. Only a mosaic wider or taller than MAX_IMAGE_SIDE is shrunk (nearest
 * pixel, so it stays water or not), and its corners don't move.
 */
export async function buildMaskImage(mosaic: FloodMosaic): Promise<MaskImage> {
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(mosaic.width, mosaic.height));
  const width = Math.max(1, Math.round(mosaic.width * scale));
  const height = Math.max(1, Math.round(mosaic.height * scale));
  let pixels = mosaic.mask;
  if (width !== mosaic.width || height !== mosaic.height) {
    pixels = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const sy = Math.min(mosaic.height - 1, Math.floor(((y + 0.5) * mosaic.height) / height));
      for (let x = 0; x < width; x++) {
        const sx = Math.min(mosaic.width - 1, Math.floor(((x + 0.5) * mosaic.width) / width));
        pixels[y * width + x] = mosaic.mask[sy * mosaic.width + sx]!;
      }
    }
  }
  const [west, south, east, north] = mosaic.bounds;
  return { png: await encodeMaskPng(width, height, pixels, WATER_COLOUR), width, height, west, south, east, north };
}
