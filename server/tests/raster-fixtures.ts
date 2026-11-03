import { inflateSync } from "node:zlib";

export interface TiffOptions {
  width: number;
  height: number;
  /** Top-left corner of the top-left cell, in the raster's UTM zone. */
  originE: number;
  originN: number;
  cell?: number;
  /** Cell height, when it differs from the width (a map with non-square cells). */
  cellY?: number;
  epsg?: number;
  /** One value per cell, row by row from the north. */
  values: ArrayLike<number>;
  /** Stored as the file's GDAL no-data value. */
  nodata?: number;
  /** 32-bit float cells, as the data team's file has; otherwise one byte per cell. */
  float?: boolean;
  /** Leaves the projected CRS out, as an unreferenced (geographic) GeoTIFF would. */
  withoutCrs?: boolean;
}

// TIFF field types.
const ASCII = 2;
const SHORT = 3;
const LONG = 4;
const DOUBLE = 12;

interface Field {
  tag: number;
  type: number;
  count: number;
  bytes: Buffer;
}

function shorts(...values: number[]): Buffer {
  const out = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => out.writeUInt16LE(v, i * 2));
  return out;
}

function doubles(...values: number[]): Buffer {
  const out = Buffer.alloc(values.length * 8);
  values.forEach((v, i) => out.writeDoubleLE(v, i * 8));
  return out;
}

/**
 * A small uncompressed GeoTIFF in a UTM zone, like the data team's flood_risk_map.tif (32-bit
 * float, no-data -9999) but a few hundred cells. Written by hand: geotiff.js's own writer only
 * writes 8-bit samples, and the real file is float.
 */
export async function buildClassTiff(options: TiffOptions): Promise<Buffer> {
  const { width, height, originE, originN, cell = 100, cellY = cell, epsg = 32632, values, nodata, float = false, withoutCrs = false } = options;
  const pixels = Buffer.alloc(width * height * (float ? 4 : 1));
  for (let i = 0; i < width * height; i++) {
    if (float) pixels.writeFloatLE(values[i]!, i * 4);
    else pixels[i] = values[i]!;
  }
  // GeoKeyDirectory: version 1.1.0, then (key, location 0 = inline, count 1, value) entries.
  const keys = withoutCrs
    ? [1024, 0, 1, 2, 1025, 0, 1, 1, 2048, 0, 1, 4326]
    : [1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, epsg];
  const text = nodata === undefined ? null : Buffer.from(`${nodata}\0`, "ascii");
  const fields: Field[] = [
    { tag: 256, type: LONG, count: 1, bytes: Buffer.from(new Uint32Array([width]).buffer) },
    { tag: 257, type: LONG, count: 1, bytes: Buffer.from(new Uint32Array([height]).buffer) },
    { tag: 258, type: SHORT, count: 1, bytes: shorts(float ? 32 : 8) },
    { tag: 259, type: SHORT, count: 1, bytes: shorts(1) },
    { tag: 262, type: SHORT, count: 1, bytes: shorts(1) },
    { tag: 273, type: LONG, count: 1, bytes: Buffer.alloc(4) }, // strip offset, filled in below
    { tag: 277, type: SHORT, count: 1, bytes: shorts(1) },
    { tag: 278, type: LONG, count: 1, bytes: Buffer.from(new Uint32Array([height]).buffer) },
    { tag: 279, type: LONG, count: 1, bytes: Buffer.from(new Uint32Array([pixels.length]).buffer) },
    { tag: 339, type: SHORT, count: 1, bytes: shorts(float ? 3 : 1) },
    { tag: 33550, type: DOUBLE, count: 3, bytes: doubles(cell, cellY, 0) },
    { tag: 33922, type: DOUBLE, count: 6, bytes: doubles(0, 0, 0, originE, originN, 0) },
    // The count includes the four-short header in front of the keys.
    { tag: 34735, type: SHORT, count: keys.length + 4, bytes: shorts(1, 1, 0, keys.length / 4, ...keys) },
    ...(text ? [{ tag: 42113, type: ASCII, count: text.length, bytes: text }] : []),
  ];

  const ifdSize = 2 + fields.length * 12 + 4;
  let extra = 8 + ifdSize;
  const offsets = fields.map((field) => {
    if (field.bytes.length <= 4) return null;
    const at = extra;
    extra += field.bytes.length + (field.bytes.length % 2);
    return at;
  });
  const dataAt = extra;
  fields.find((f) => f.tag === 273)!.bytes.writeUInt32LE(dataAt, 0);

  const out = Buffer.alloc(dataAt + pixels.length);
  out.write("II", 0, "ascii");
  out.writeUInt16LE(42, 2);
  out.writeUInt32LE(8, 4);
  out.writeUInt16LE(fields.length, 8);
  fields.forEach((field, i) => {
    const at = 10 + i * 12;
    out.writeUInt16LE(field.tag, at);
    out.writeUInt16LE(field.type, at + 2);
    out.writeUInt32LE(field.count, at + 4);
    const offset = offsets[i];
    if (offset === null || offset === undefined) field.bytes.copy(out, at + 8);
    else {
      out.writeUInt32LE(offset, at + 8);
      field.bytes.copy(out, offset);
    }
  });
  pixels.copy(out, dataAt);
  return out;
}

export interface DecodedPng {
  width: number;
  height: number;
  colourType: number;
  /** One palette index per pixel. */
  indices: Uint8Array;
  palette: string[];
  /** The first transparency entry (alpha of palette index 0). */
  firstAlpha: number;
}

/** Reads back the palette PNGs the overlay builder writes (filters 0, 1 and 2). */
export function decodePalettePng(png: Buffer): DecodedPng {
  if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Not a PNG");
  let width = 0;
  let height = 0;
  let colourType = -1;
  let palette: string[] = [];
  let firstAlpha = 255;
  const data: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    const type = png.subarray(at + 4, at + 8).toString("ascii");
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      colourType = body[9]!;
    } else if (type === "PLTE") {
      for (let i = 0; i < body.length; i += 3) palette.push(`#${[0, 1, 2].map((k) => body[i + k]!.toString(16).padStart(2, "0")).join("")}`);
    } else if (type === "tRNS") firstAlpha = body[0]!;
    else if (type === "IDAT") data.push(body);
    at += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(data));
  const indices = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (width + 1)]!;
    for (let x = 0; x < width; x++) {
      const byte = raw[y * (width + 1) + 1 + x]!;
      const left = x > 0 ? indices[y * width + x - 1]! : 0;
      const up = y > 0 ? indices[(y - 1) * width + x]! : 0;
      indices[y * width + x] = (filter === 0 ? byte : filter === 1 ? byte + left : filter === 2 ? byte + up : -1) & 255;
      if (filter > 2) throw new Error(`Unsupported PNG filter ${filter}`);
    }
  }
  palette = palette.slice();
  return { width, height, colourType, indices, palette, firstAlpha };
}
