import { promisify } from "node:util";
import { deflate } from "node:zlib";
import { FLOOD_RISK_CLASSES, type ClassRaster, type OverlayImage } from "./flood-risk.types";
import { dataBounds, latOfMercatorY, lonOfMercatorX, mercatorX, mercatorY, utmConverter, type UtmConverter } from "./raster-projection";

const deflateAsync = promisify(deflate);

/** Output pixel size in Web Mercator metres: half a 100 m cell, so each source cell is a crisp 2 x 2 block. */
export const METRES_PER_PIXEL = 50;

/**
 * How far apart, in output pixels, the points are where the exact projection is worked out. In
 * between, eastings and northings are interpolated: over 1.6 km the projection is straight to well
 * under a centimetre, and the exact projection per pixel (8 million of them) would hold the API up for seconds.
 */
const LATTICE_STEP = 32;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** A palette PNG: index 0 is transparent (no data), 1..n are the colours. Flat areas keep it to a few hundred KB. */
export async function encodePalettePng(width: number, height: number, indices: Uint8Array, colours: readonly string[]): Promise<Buffer> {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 3; // colour type: palette
  // The "Up" filter on every row turns large flat areas into runs of zeros, which deflate well.
  const raw = Buffer.alloc((width + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width + 1);
    raw[row] = 2;
    for (let x = 0; x < width; x++) raw[row + 1 + x] = (indices[y * width + x]! - (y > 0 ? indices[(y - 1) * width + x]! : 0)) & 255;
  }
  const palette = Buffer.from(["#000000", ...colours].flatMap((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("PLTE", palette),
    chunk("tRNS", Buffer.from([0])),
    chunk("IDAT", await deflateAsync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Lays the classified map out as a picture on the Web Mercator grid (the grid Mapbox draws on), so
 * the four corners can pin it exactly: for each pixel it finds the source cell under it (nearest
 * neighbour, so a pixel is always a real class, never a blend) and copies that class.
 */
export async function buildOverlay(raster: ClassRaster, converter: UtmConverter = utmConverter(raster.epsg)): Promise<OverlayImage> {
  const [lonW, latS, lonE, latN] = dataBounds(raster, converter);
  const pad = METRES_PER_PIXEL;
  const west = mercatorX(lonW) - pad;
  const north = mercatorY(latN) + pad;
  const width = Math.ceil((mercatorX(lonE) + pad - west) / METRES_PER_PIXEL);
  const height = Math.ceil((north - (mercatorY(latS) - pad)) / METRES_PER_PIXEL);
  const east = west + width * METRES_PER_PIXEL;
  const south = north - height * METRES_PER_PIXEL;

  // Eastings and northings at the lattice points, which lie on pixel edges (u, v are in pixels).
  const nx = Math.ceil(width / LATTICE_STEP) + 2;
  const ny = Math.ceil(height / LATTICE_STEP) + 2;
  const easting = new Float64Array(nx * ny);
  const northing = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) {
    const lat = latOfMercatorY(north - j * LATTICE_STEP * METRES_PER_PIXEL);
    for (let i = 0; i < nx; i++) {
      const [e, n] = converter.toUtm([lonOfMercatorX(west + i * LATTICE_STEP * METRES_PER_PIXEL), lat]);
      easting[j * nx + i] = e;
      northing[j * nx + i] = n;
    }
  }

  const { classes, originE, originN, cellSize } = raster;
  const indices = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const v = (y + 0.5) / LATTICE_STEP;
    const j = Math.floor(v);
    const fv = v - j;
    for (let x = 0; x < width; x++) {
      const u = (x + 0.5) / LATTICE_STEP;
      const i = Math.floor(u);
      const fu = u - i;
      const a = j * nx + i;
      const b = a + nx;
      const e = (easting[a]! * (1 - fu) + easting[a + 1]! * fu) * (1 - fv) + (easting[b]! * (1 - fu) + easting[b + 1]! * fu) * fv;
      const n = (northing[a]! * (1 - fu) + northing[a + 1]! * fu) * (1 - fv) + (northing[b]! * (1 - fu) + northing[b + 1]! * fu) * fv;
      const col = Math.floor((e - originE) / cellSize);
      const row = Math.floor((originN - n) / cellSize);
      if (col < 0 || col >= raster.width || row < 0 || row >= raster.height) continue;
      indices[y * width + x] = classes[row * raster.width + col]!;
    }
  }

  const png = await encodePalettePng(width, height, indices, FLOOD_RISK_CLASSES.map((c) => c.color));
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  return { png, width, height, west: round(lonOfMercatorX(west)), south: round(latOfMercatorY(south)), east: round(lonOfMercatorX(east)), north: round(latOfMercatorY(north)) };
}
