import { zipSync } from "fflate";

/**
 * Builds small shapefiles byte by byte, so the readers are tested without binary fixtures in
 * the repo. Layouts follow the ESRI Shapefile Technical Description and the dBASE III header.
 */

export type Ring = [number, number][];

/** A 1 x 1 square starting at (x, y), wound counter-clockwise. */
export function square(x: number, y: number, size = 1): Ring {
  return [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]];
}

/** The same ring wound the other way. */
export const reversed = (ring: Ring): Ring => [...ring].reverse();

function signedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i]![0] * ring[i + 1]![1] - ring[i + 1]![0] * ring[i]![1];
  return sum / 2;
}

/** Shapefile rule: outer rings run clockwise. */
export const outerRing = (ring: Ring): Ring => (signedArea(ring) > 0 ? reversed(ring) : ring);
/** Shapefile rule: holes run counter-clockwise. */
export const holeRing = (ring: Ring): Ring => (signedArea(ring) < 0 ? reversed(ring) : ring);

function doubles(...values: number[]): Buffer {
  const buffer = Buffer.alloc(8 * values.length);
  values.forEach((value, i) => buffer.writeDoubleLE(value, 8 * i));
  return buffer;
}

function int32LE(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32LE(value);
  return buffer;
}

function boxOf(points: [number, number][]): Buffer {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return doubles(Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys));
}

/** type 5 Polygon, 3 PolyLine; +10 adds the Z block (Z range and a Z per point, all 7). */
export function partsRecord(type: 3 | 5 | 13 | 15, parts: Ring[]): Buffer {
  const points = parts.flat();
  const starts = parts.reduce<number[]>((acc, part, i) => [...acc, i === 0 ? 0 : acc[i - 1]! + parts[i - 1]!.length], []);
  const body = Buffer.concat([
    int32LE(type),
    boxOf(points),
    int32LE(parts.length),
    int32LE(points.length),
    ...starts.map(int32LE),
    ...points.map(([x, y]) => doubles(x, y)),
  ]);
  return type >= 13 ? Buffer.concat([body, doubles(7, 7), doubles(...points.map(() => 7))]) : body;
}

export function pointRecord(x: number, y: number): Buffer {
  return Buffer.concat([int32LE(1), doubles(x, y)]);
}

export function multiPointRecord(points: [number, number][]): Buffer {
  return Buffer.concat([int32LE(8), boxOf(points), int32LE(points.length), ...points.map(([x, y]) => doubles(x, y))]);
}

export const nullRecord = (): Buffer => int32LE(0);

/** A whole .shp: the 100-byte header, then each record with its 8-byte record header. */
export function buildShp(shapeType: number, records: Buffer[]): Buffer {
  const body = Buffer.concat(
    records.map((content, i) => {
      const header = Buffer.alloc(8);
      header.writeInt32BE(i + 1, 0);
      header.writeInt32BE(content.length / 2, 4);
      return Buffer.concat([header, content]);
    }),
  );
  const header = Buffer.alloc(100);
  header.writeInt32BE(9994, 0);
  header.writeInt32BE((100 + body.length) / 2, 24);
  header.writeInt32LE(1000, 28);
  header.writeInt32LE(shapeType, 32);
  return Buffer.concat([header, body]);
}

export interface DbfColumn {
  name: string;
  type: "C" | "N" | "D" | "L" | "M";
  length: number;
}

/** A .dbf with one row per entry of `rows` (strings, in column order). `deleted` flags row indexes. */
export function buildDbf(
  columns: DbfColumn[],
  rows: string[][],
  options: { deleted?: number[]; encoding?: "utf8" | "latin1"; languageDriver?: number } = {},
): Buffer {
  const recordBytes = 1 + columns.reduce((sum, c) => sum + c.length, 0);
  const headerBytes = 32 + 32 * columns.length + 1;
  const header = Buffer.alloc(32);
  header[0] = 3;
  header.writeUInt32LE(rows.length, 4);
  header.writeUInt16LE(headerBytes, 8);
  header.writeUInt16LE(recordBytes, 10);
  header[29] = options.languageDriver ?? 0;

  const descriptors = columns.map((column) => {
    const descriptor = Buffer.alloc(32);
    descriptor.write(column.name, 0, 10, "latin1");
    descriptor.write(column.type, 11, "latin1");
    descriptor[16] = column.length;
    return descriptor;
  });

  const encoding = options.encoding ?? "utf8";
  const records = rows.map((row, r) => {
    const record = Buffer.alloc(recordBytes, 0x20);
    record[0] = options.deleted?.includes(r) ? 0x2a : 0x20;
    let at = 1;
    columns.forEach((column, c) => {
      const value = Buffer.from(row[c] ?? "", encoding);
      value.copy(record, at, 0, Math.min(value.length, column.length));
      at += column.length;
    });
    return record;
  });
  return Buffer.concat([header, ...descriptors, Buffer.from([0x0d]), ...records, Buffer.from([0x1a])]);
}

export const WGS84_PRJ =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

export const UTM_31N_PRJ =
  'PROJCS["WGS_1984_UTM_Zone_31N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],UNIT["Meter",1.0]]';

export const MINNA_PRJ =
  'GEOGCS["GCS_Minna",DATUM["D_Minna",SPHEROID["Clarke_1880_RGS",6378249.145,293.465]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

/** A zip of named files, as GIS tools and Windows "Send to > Compressed folder" make them. */
export function buildZip(files: Record<string, Buffer | string>): Buffer {
  const entries: Record<string, Uint8Array> = {};
  for (const [name, content] of Object.entries(files)) entries[name] = typeof content === "string" ? Buffer.from(content) : content;
  return Buffer.from(zipSync(entries));
}
