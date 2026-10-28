import type { Geometry, Position } from "geojson";

/**
 * Turns a GeoPackage geometry blob into GeoJSON, so GeoPackage features go through the same
 * checks as GeoJSON ones (map-layer-rows.ts, then PostGIS). A blob is a short "GP" header
 * (flags, SRS id, an optional bounding box) followed by standard WKB.
 *
 * Returns null for an empty or unreadable shape, and the loader counts that row as "no shape".
 * Z and M values are read past and dropped: every layer stores 2D shapes.
 *
 * Spec: https://www.geopackage.org/spec/#gpb_format (section 2.1.3).
 */
export function parseGpkgGeometry(blob: Uint8Array | null | undefined): Geometry | null {
  if (!blob || blob.length < 8 || blob[0] !== 0x47 || blob[1] !== 0x50) return null;
  const flags = blob[3]!;
  if (flags & 0b0001_0000) return null; // the "empty geometry" flag
  if (flags & 0b0010_0000) return null; // an extended (non-standard) geometry type

  const envelopeBytes = [0, 32, 48, 48, 64][(flags >> 1) & 0b111];
  if (envelopeBytes === undefined) return null;
  const start = 8 + envelopeBytes;
  if (blob.length <= start) return null;

  try {
    const reader = new WkbReader(new DataView(blob.buffer, blob.byteOffset + start, blob.length - start));
    return reader.geometry();
  } catch {
    return null;
  }
}

const POINT = 1;
const LINESTRING = 2;
const POLYGON = 3;
const MULTIPOINT = 4;
const MULTILINESTRING = 5;
const MULTIPOLYGON = 6;
const COLLECTION = 7;

/** Reads one WKB geometry (ISO or EWKB dimension flags), a value at a time. */
class WkbReader {
  private offset = 0;
  private littleEndian = true;
  private dims = 2;

  constructor(private readonly view: DataView) {}

  geometry(): Geometry {
    this.littleEndian = this.view.getUint8(this.offset) === 1;
    this.offset += 1;
    const raw = this.uint32();

    // EWKB marks Z/M with high bits; ISO WKB adds 1000 (Z), 2000 (M) or 3000 (ZM) to the type.
    const ewkbZ = (raw & 0x8000_0000) !== 0;
    const ewkbM = (raw & 0x4000_0000) !== 0;
    if (raw & 0x2000_0000) this.offset += 4; // an EWKB SRID, never expected inside a GeoPackage
    const iso = raw & 0x0fff_ffff;
    const type = iso % 1000;
    const isoDims = Math.floor(iso / 1000);
    const hasZ = ewkbZ || isoDims === 1 || isoDims === 3;
    const hasM = ewkbM || isoDims === 2 || isoDims === 3;
    const outerDims = this.dims;
    this.dims = 2 + (hasZ ? 1 : 0) + (hasM ? 1 : 0);

    let result: Geometry;
    switch (type) {
      case POINT: {
        const position = this.position();
        // WKB writes an empty point as NaN coordinates.
        result = Number.isNaN(position[0]) ? { type: "Point", coordinates: [] } : { type: "Point", coordinates: position };
        break;
      }
      case LINESTRING:
        result = { type: "LineString", coordinates: this.positions() };
        break;
      case POLYGON:
        result = { type: "Polygon", coordinates: this.rings() };
        break;
      case MULTIPOINT:
        result = { type: "MultiPoint", coordinates: this.parts(() => (this.geometry() as { coordinates: Position }).coordinates) };
        break;
      case MULTILINESTRING:
        result = { type: "MultiLineString", coordinates: this.parts(() => (this.geometry() as { coordinates: Position[] }).coordinates) };
        break;
      case MULTIPOLYGON:
        result = { type: "MultiPolygon", coordinates: this.parts(() => (this.geometry() as { coordinates: Position[][] }).coordinates) };
        break;
      case COLLECTION:
        result = { type: "GeometryCollection", geometries: this.parts(() => this.geometry()) };
        break;
      default:
        throw new Error(`unsupported WKB type ${type}`);
    }
    this.dims = outerDims;
    return result;
  }

  private uint32(): number {
    const value = this.view.getUint32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }

  private position(): Position {
    const x = this.view.getFloat64(this.offset, this.littleEndian);
    const y = this.view.getFloat64(this.offset + 8, this.littleEndian);
    this.offset += 8 * this.dims;
    return [x, y];
  }

  private positions(): Position[] {
    return this.parts(() => this.position());
  }

  private rings(): Position[][] {
    return this.parts(() => this.positions());
  }

  private parts<T>(read: () => T): T[] {
    const count = this.uint32();
    // A count larger than the bytes left can only be a corrupt blob; stop before allocating it.
    if (count > this.view.byteLength - this.offset) throw new Error("WKB count runs past the end");
    const items: T[] = [];
    for (let i = 0; i < count; i += 1) items.push(read());
    return items;
  }
}
