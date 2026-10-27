import type { Geometry, Position } from "geojson";
import type { ValidationError } from "../../../../common/errors/app-error";
import { fileError } from "./file-error";
import { MAX_IMPORT_ROWS } from "./reader-limits";

/**
 * Reads the geometry file of a shapefile (.shp) into GeoJSON geometries, one per record, in
 * file order. The format is the ESRI Shapefile Technical Description (July 1998), a binary
 * file of a 100-byte header followed by records; the header is big-endian where it holds file
 * code and lengths, and little-endian everywhere else.
 *
 * Only X and Y are kept. Z and M values are dropped: the platform stores 2D shapes. Every read
 * is bounds-checked against the record it belongs to, so a damaged or hostile file produces a
 * 400 rather than a crash or a huge allocation.
 */

const FILE_CODE = 9994;
const HEADER_BYTES = 100;

const NULL_SHAPE = 0;
const MULTIPATCH = 31;

type Family = "point" | "polyline" | "polygon" | "multipoint";

/** Shape types come in plain, Z (+10) and M (+20) flavours of four families. */
const FAMILY: Record<number, Family> = {
  1: "point", 11: "point", 21: "point",
  3: "polyline", 13: "polyline", 23: "polyline",
  5: "polygon", 15: "polygon", 25: "polygon",
  8: "multipoint", 18: "multipoint", 28: "multipoint",
};

/** [minX, minY, maxX, maxY] over every coordinate actually read (not the header's claim). */
export type Extent = [number, number, number, number];

export interface ShpResult {
  /** One entry per record; null for a record with no shape. */
  geometries: (Geometry | null)[];
  extent: Extent | null;
  /** Rings the file left open (first point != last point) that were closed on reading. */
  closedRings: number;
}

interface ParseState {
  extent: Extent | null;
  closedRings: number;
}

/** Whether these bytes start like a shapefile (file code 9994). */
export function looksLikeShp(buffer: Buffer): boolean {
  return buffer.length >= HEADER_BYTES && buffer.readInt32BE(0) === FILE_CODE;
}

export function parseShp(buffer: Buffer): ShpResult {
  if (!looksLikeShp(buffer)) {
    throw fileError("The file is not a valid shapefile (.shp): it doesn't start with the shapefile header.");
  }
  const declared = buffer.readInt32BE(24) * 2;
  if (declared > buffer.length) {
    throw fileError(`The .shp is incomplete: its header says ${declared} bytes but the file has ${buffer.length}. Upload it again.`);
  }
  const end = declared >= HEADER_BYTES ? declared : buffer.length;

  const state: ParseState = { extent: null, closedRings: 0 };
  const geometries: (Geometry | null)[] = [];
  let offset = HEADER_BYTES;
  while (offset + 8 <= end) {
    const contentBytes = buffer.readInt32BE(offset + 4) * 2;
    const start = offset + 8;
    const stop = start + contentBytes;
    if (contentBytes < 4 || stop > end) throw damaged(geometries.length + 1);
    if (geometries.length >= MAX_IMPORT_ROWS) {
      throw fileError(`The file has more than ${MAX_IMPORT_ROWS} shapes; split it into smaller files.`);
    }
    geometries.push(readShape(buffer, start, stop, state, geometries.length + 1));
    offset = stop;
  }
  return { geometries, extent: state.extent, closedRings: state.closedRings };
}

function readShape(buffer: Buffer, start: number, stop: number, state: ParseState, recordNumber: number): Geometry | null {
  const type = buffer.readInt32LE(start);
  if (type === NULL_SHAPE) return null;
  if (type === MULTIPATCH) {
    throw fileError("This shapefile holds MultiPatch (3D surface) shapes, which can't be imported as areas.");
  }
  const family = FAMILY[type];
  if (!family) throw fileError(`Shape ${recordNumber} has an unknown shape type (${type}); the file may be damaged.`);

  if (family === "point") {
    if (start + 20 > stop) throw damaged(recordNumber);
    return { type: "Point", coordinates: readPoint(buffer, start + 4, state, recordNumber) };
  }

  // MultiPoint: type, box (32), numPoints (4), points. Polyline/Polygon: type, box (32),
  // numParts (4), numPoints (4), parts (4 each), points (16 each).
  if (family === "multipoint") {
    if (start + 40 > stop) throw damaged(recordNumber);
    const count = buffer.readInt32LE(start + 36);
    if (count < 0 || start + 40 + 16 * count > stop) throw damaged(recordNumber);
    const coordinates = readPoints(buffer, start + 40, count, state, recordNumber);
    return coordinates.length === 0 ? null : { type: "MultiPoint", coordinates };
  }

  if (start + 44 > stop) throw damaged(recordNumber);
  const partCount = buffer.readInt32LE(start + 36);
  const pointCount = buffer.readInt32LE(start + 40);
  const partsAt = start + 44;
  const pointsAt = partsAt + 4 * partCount;
  if (partCount < 0 || pointCount < 0 || pointsAt + 16 * pointCount > stop) throw damaged(recordNumber);

  const points = readPoints(buffer, pointsAt, pointCount, state, recordNumber);
  const parts: Position[][] = [];
  for (let p = 0; p < partCount; p++) {
    const from = buffer.readInt32LE(partsAt + 4 * p);
    const to = p + 1 < partCount ? buffer.readInt32LE(partsAt + 4 * (p + 1)) : pointCount;
    if (from < 0 || to < from || to > pointCount) throw damaged(recordNumber);
    parts.push(points.slice(from, to));
  }
  if (parts.length === 0) return null;

  if (family === "polyline") {
    return parts.length === 1 ? { type: "LineString", coordinates: parts[0]! } : { type: "MultiLineString", coordinates: parts };
  }
  const rings = parts.filter((ring) => ring.length > 0).map((ring) => closeRing(ring, state));
  return ringsToPolygons(rings);
}

function readPoints(buffer: Buffer, at: number, count: number, state: ParseState, recordNumber: number): Position[] {
  const points: Position[] = new Array<Position>(count);
  for (let i = 0; i < count; i++) points[i] = readPoint(buffer, at + 16 * i, state, recordNumber);
  return points;
}

function readPoint(buffer: Buffer, at: number, state: ParseState, recordNumber: number): Position {
  const x = buffer.readDoubleLE(at);
  const y = buffer.readDoubleLE(at + 8);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw fileError(`Shape ${recordNumber} has a coordinate that isn't a number; the file may be damaged.`);
  }
  const box = state.extent;
  if (!box) state.extent = [x, y, x, y];
  else {
    if (x < box[0]) box[0] = x;
    if (y < box[1]) box[1] = y;
    if (x > box[2]) box[2] = x;
    if (y > box[3]) box[3] = y;
  }
  return [x, y];
}

/** GeoJSON rings must end where they start; some writers leave them open. */
function closeRing(ring: Position[], state: ParseState): Position[] {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first && last && (first[0] !== last[0] || first[1] !== last[1])) {
    state.closedRings++;
    return [...ring, [first[0]!, first[1]!]];
  }
  return ring;
}

interface Ring {
  positions: Position[];
  /** Shoelace area: positive when counter-clockwise, negative when clockwise (y up). */
  area: number;
  box: Extent;
}

/**
 * Turns a polygon record's rings into GeoJSON. The shapefile rule is that outer rings run
 * clockwise and holes counter-clockwise, and a record may hold several of each. A hole belongs
 * to the smallest outer ring that contains it. A file wound the other way round (every ring
 * counter-clockwise) is read with the rule flipped, and a hole that sits in no outer ring is
 * kept as a polygon of its own rather than dropped. The output follows RFC 7946: outer rings
 * counter-clockwise, holes clockwise.
 */
function ringsToPolygons(rings: Position[][]): Geometry | null {
  const infos: Ring[] = rings.map((positions) => ({ positions, area: signedArea(positions), box: boxOf(positions) }));
  const outerSign = infos.some((r) => r.area < 0) ? -1 : 1;

  const polygons: { outer: Ring; holes: Ring[] }[] = [];
  const holes: Ring[] = [];
  for (const ring of infos) {
    if (Math.sign(ring.area) === outerSign) polygons.push({ outer: ring, holes: [] });
    else holes.push(ring);
  }
  for (const hole of holes) {
    const probe = hole.positions[0]!;
    let home: (typeof polygons)[number] | null = null;
    for (const polygon of polygons) {
      if (!boxContains(polygon.outer.box, probe) || !pointInRing(probe, polygon.outer.positions)) continue;
      if (!home || Math.abs(polygon.outer.area) < Math.abs(home.outer.area)) home = polygon;
    }
    if (home) home.holes.push(hole);
    else polygons.push({ outer: hole, holes: [] });
  }

  const coordinates = polygons.map(({ outer, holes: inner }) => [
    orient(outer, true),
    ...inner.map((hole) => orient(hole, false)),
  ]);
  if (coordinates.length === 0) return null;
  return coordinates.length === 1 ? { type: "Polygon", coordinates: coordinates[0]! } : { type: "MultiPolygon", coordinates };
}

/** The ring wound counter-clockwise (outer) or clockwise (hole), reversing it if needed. */
function orient(ring: Ring, counterClockwise: boolean): Position[] {
  const isCounterClockwise = ring.area > 0;
  return ring.area !== 0 && isCounterClockwise !== counterClockwise ? [...ring.positions].reverse() : ring.positions;
}

function signedArea(ring: Position[]): number {
  // Relative to the first point, which keeps the sums small and the result exact for small rings.
  const [x0, y0] = ring[0] ?? [0, 0];
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [ax, ay] = ring[i]!;
    const [bx, by] = ring[i + 1]!;
    sum += (ax! - x0!) * (by! - y0!) - (bx! - x0!) * (ay! - y0!);
  }
  return sum / 2;
}

function boxOf(ring: Position[]): Extent {
  const box: Extent = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of ring) {
    if (x! < box[0]) box[0] = x!;
    if (y! < box[1]) box[1] = y!;
    if (x! > box[2]) box[2] = x!;
    if (y! > box[3]) box[3] = y!;
  }
  return box;
}

function boxContains(box: Extent, [x, y]: Position): boolean {
  return x! >= box[0] && x! <= box[2] && y! >= box[1] && y! <= box[3];
}

/** Ray casting: counts how many ring edges lie to the right of the point. */
function pointInRing([x, y]: Position, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi! > y! !== yj! > y! && x! < ((xj! - xi!) * (y! - yi!)) / (yj! - yi!) + xi!) inside = !inside;
  }
  return inside;
}

function damaged(recordNumber: number): ValidationError {
  return fileError(`Shape ${recordNumber} in the .shp is cut short or damaged, so the file can't be read. Upload the file again.`);
}
