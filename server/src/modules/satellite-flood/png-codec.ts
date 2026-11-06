import { promisify } from "node:util";
import { deflate, inflateSync } from "node:zlib";
import { pngChunk, PNG_SIGNATURE } from "../flood-risk/overlay-image";

const deflateAsync = promisify(deflate);

/** A decoded tile: one alpha value per pixel (0 = transparent), and each pixel's colour as 0xRRGGBB. */
export interface DecodedTile {
  width: number;
  height: number;
  alpha: Uint8Array;
  rgb: Uint32Array;
}

/** Why a tile could not be read; the caller turns it into a message that names the file. */
export class PngError extends Error {}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Reads one PNG tile into alpha and colour, the way a browser would draw it. Handles every colour
 * type at 8 bits, and palettes at 1, 2, 4 or 8 bits; refuses 16-bit and interlaced PNGs, which tile
 * makers don't write, rather than guessing.
 */
export function decodePng(bytes: Uint8Array): DecodedTile {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new PngError("is not a PNG");

  let width = 0;
  let height = 0;
  let depth = 0;
  let colourType = -1;
  let palette: Buffer | null = null;
  let transparency: Buffer | null = null;
  const data: Buffer[] = [];
  for (let at = 8; at + 8 <= buf.length; ) {
    const length = buf.readUInt32BE(at);
    const type = buf.toString("latin1", at + 4, at + 8);
    const body = buf.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8]!;
      colourType = body[9]!;
      if (body[12] !== 0) throw new PngError("is an interlaced PNG");
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") transparency = body;
    else if (type === "IDAT") data.push(body);
    else if (type === "IEND") break;
    at += 12 + length;
  }
  const channels = CHANNELS[colourType];
  if (!channels || width === 0 || height === 0) throw new PngError("has no readable PNG header");
  if (depth !== 8 && !(colourType === 3 && [1, 2, 4].includes(depth))) throw new PngError(`is a ${depth}-bit PNG`);
  if (colourType === 3 && !palette) throw new PngError("is a palette PNG without a palette");

  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(data));
  } catch {
    throw new PngError("has damaged image data");
  }
  const stride = Math.ceil((width * channels * depth) / 8);
  if (raw.length < (stride + 1) * height) throw new PngError("is cut short");
  const pixels = unfilter(raw, stride, height, Math.max(1, (channels * depth) >> 3));

  const alpha = new Uint8Array(width * height);
  const rgb = new Uint32Array(width * height);
  // A tRNS chunk makes one grey or one colour value transparent (types 0 and 2), or gives palette entries an alpha.
  const key = transparency && colourType === 0 ? transparency.readUInt16BE(0) & 255 : -1;
  const keyRgb = transparency && colourType === 2 ? ((transparency.readUInt16BE(0) & 255) << 16) | ((transparency.readUInt16BE(2) & 255) << 8) | (transparency.readUInt16BE(4) & 255) : -1;
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      switch (colourType) {
        case 6: {
          const p = row + x * 4;
          rgb[i] = (pixels[p]! << 16) | (pixels[p + 1]! << 8) | pixels[p + 2]!;
          alpha[i] = pixels[p + 3]!;
          break;
        }
        case 4: {
          const g = pixels[row + x * 2]!;
          rgb[i] = (g << 16) | (g << 8) | g;
          alpha[i] = pixels[row + x * 2 + 1]!;
          break;
        }
        case 2: {
          const p = row + x * 3;
          rgb[i] = (pixels[p]! << 16) | (pixels[p + 1]! << 8) | pixels[p + 2]!;
          alpha[i] = rgb[i] === keyRgb ? 0 : 255;
          break;
        }
        case 0: {
          const g = pixels[row + x]!;
          rgb[i] = (g << 16) | (g << 8) | g;
          alpha[i] = g === key ? 0 : 255;
          break;
        }
        case 3: {
          const perByte = 8 / depth;
          const index = depth === 8 ? pixels[row + x]! : (pixels[row + Math.floor(x / perByte)]! >> (8 - depth * ((x % perByte) + 1))) & ((1 << depth) - 1);
          rgb[i] = (palette![index * 3]! << 16) | (palette![index * 3 + 1]! << 8) | palette![index * 3 + 2]!;
          alpha[i] = transparency && index < transparency.length ? transparency[index]! : 255;
          break;
        }
      }
    }
  }
  return { width, height, alpha, rgb };
}

/** Undoes PNG's per-row filters (None, Sub, Up, Average, Paeth). `bpp` is bytes per pixel, at least 1. */
function unfilter(raw: Buffer, stride: number, height: number, bpp: number): Uint8Array {
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[dst + x - bpp]! : 0;
      const b = y > 0 ? out[dst - stride + x]! : 0;
      const c = x >= bpp && y > 0 ? out[dst - stride + x - bpp]! : 0;
      let value = raw[src + x]!;
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) throw new PngError("has an unknown row filter");
      out[dst + x] = value & 255;
    }
  }
  return out;
}

/**
 * A 1-bit palette PNG: 0 transparent, 1 the given colour. Eight pixels to a byte, so a month of
 * Rivers State at about 38 m comes to a few hundred KB.
 */
export async function encodeMaskPng(width: number, height: number, mask: Uint8Array, colour: string): Promise<Buffer> {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 1; // bit depth
  header[9] = 3; // colour type: palette
  const stride = Math.ceil(width / 8);
  const raw = Buffer.alloc((stride + 1) * height); // filter byte 0 (None) on every row
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1) + 1;
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) raw[row + (x >> 3)] = raw[row + (x >> 3)]! | (0x80 >> (x & 7));
    }
  }
  const rgb = [1, 3, 5].map((i) => parseInt(colour.slice(i, i + 2), 16));
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", header),
    pngChunk("PLTE", Buffer.from([0, 0, 0, ...rgb])),
    pngChunk("tRNS", Buffer.from([0, 255])),
    pngChunk("IDAT", await deflateAsync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
