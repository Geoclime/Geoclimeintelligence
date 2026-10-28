import type { Geometry, Position } from "geojson";
import initSqlJs from "sql.js";

// Builds small GeoPackages in memory, shaped like Geofabrik's (one feature table, EPSG:4326,
// osm_id / code / fclass / name columns), so the reader and loader are tested on real files.

export interface FixtureRow {
  osm_id: string | null;
  fclass: string | null;
  name?: string | null;
  geom: Geometry | null;
}

export interface FixtureOptions {
  table?: string;
  /** The SRS the geometry column is declared in. */
  srs?: { id: number; organization: string; code: number };
}

export async function makeGeoPackage(rows: FixtureRow[], options: FixtureOptions = {}): Promise<Buffer> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const table = options.table ?? "gis_osm_pois_free_1_rivers";
  const srs = options.srs ?? { id: 4326, organization: "EPSG", code: 4326 };
  db.run(`
    CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT, srs_id INTEGER PRIMARY KEY, organization TEXT, organization_coordsys_id INTEGER, definition TEXT);
    CREATE TABLE gpkg_contents (table_name TEXT PRIMARY KEY, data_type TEXT, identifier TEXT);
    CREATE TABLE gpkg_geometry_columns (table_name TEXT, column_name TEXT, geometry_type_name TEXT, srs_id INTEGER, z INTEGER, m INTEGER);
    CREATE TABLE "${table}" (fid INTEGER PRIMARY KEY, geom BLOB, osm_id TEXT, code INTEGER, fclass TEXT, name TEXT);
  `);
  db.run(`INSERT INTO gpkg_spatial_ref_sys VALUES ('fixture', ?, ?, ?, '')`, [srs.id, srs.organization, srs.code]);
  db.run(`INSERT INTO gpkg_contents VALUES (?, 'features', ?)`, [table, table]);
  db.run(`INSERT INTO gpkg_geometry_columns VALUES (?, 'geom', 'GEOMETRY', ?, 0, 0)`, [table, srs.id]);
  for (const row of rows) {
    db.run(`INSERT INTO "${table}" (geom, osm_id, code, fclass, name) VALUES (?, ?, 2000, ?, ?)`, [
      row.geom ? gpkgBlob(row.geom, srs.id) : null,
      row.osm_id,
      row.fclass,
      row.name ?? null,
    ]);
  }
  const bytes = db.export();
  db.close();
  return Buffer.from(bytes);
}

/** A GeoPackage geometry blob: the "GP" header with an XY envelope, then little-endian WKB. */
export function gpkgBlob(geometry: Geometry, srsId = 4326): Uint8Array {
  const wkb = toWkb(geometry);
  const header = Buffer.alloc(8 + 32);
  header.write("GP", 0, "latin1");
  header.writeUInt8(0, 2); // version
  header.writeUInt8(0b0000_0011, 3); // little-endian, XY envelope
  header.writeInt32LE(srsId, 4);
  // The envelope is never read by the decoder; zeros are enough.
  return new Uint8Array(Buffer.concat([header, wkb]));
}

function toWkb(geometry: Geometry): Buffer {
  const parts: Buffer[] = [];
  const head = (type: number) => {
    const b = Buffer.alloc(5);
    b.writeUInt8(1, 0);
    b.writeUInt32LE(type, 1);
    parts.push(b);
  };
  const count = (n: number) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n, 0);
    parts.push(b);
  };
  const point = ([x, y]: Position) => {
    const b = Buffer.alloc(16);
    b.writeDoubleLE(x!, 0);
    b.writeDoubleLE(y!, 8);
    parts.push(b);
  };
  const ring = (positions: Position[]) => {
    count(positions.length);
    positions.forEach(point);
  };
  switch (geometry.type) {
    case "Point":
      head(1);
      point(geometry.coordinates);
      break;
    case "LineString":
      head(2);
      ring(geometry.coordinates);
      break;
    case "Polygon":
      head(3);
      count(geometry.coordinates.length);
      geometry.coordinates.forEach(ring);
      break;
    case "MultiPolygon":
      head(6);
      count(geometry.coordinates.length);
      for (const polygon of geometry.coordinates) parts.push(toWkb({ type: "Polygon", coordinates: polygon }));
      break;
    default:
      throw new Error(`fixture can't encode ${geometry.type}`);
  }
  return Buffer.concat(parts);
}
