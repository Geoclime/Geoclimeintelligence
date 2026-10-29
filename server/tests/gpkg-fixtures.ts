import type { Geometry, Position } from "geojson";
import initSqlJs from "sql.js";

// Builds small GeoPackages in memory, shaped like Geofabrik's (one feature table, EPSG:4326,
// osm_id / code / fclass / name columns), so the reader and loader are tested on real files.

export interface FixtureRow {
  osm_id: string | null;
  fclass: string | null;
  name?: string | null;
  /** Only stored when the table has a `type` column (buildings files do). */
  type?: string | null;
  geom: Geometry | null;
}

export interface FixtureOptions {
  table?: string;
  /** The SRS the geometry column is declared in. */
  srs?: { id: number; organization: string; code: number };
  /** Add Geofabrik's buildings `type` column. */
  withType?: boolean;
  /** Record a feature count in gpkg_ogr_contents, as GDAL does. */
  featureCount?: number;
  /**
   * Pages of filler written after the features, standing in for the spatial index GDAL writes
   * last. Cutting them off makes a file that is cut short while every row is intact.
   */
  trailingPages?: number;
}

export const FIXTURE_PAGE_SIZE = 4096;

export async function makeGeoPackage(rows: FixtureRow[], options: FixtureOptions = {}): Promise<Buffer> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  const table = options.table ?? "gis_osm_pois_free_1_rivers";
  const srs = options.srs ?? { id: 4326, organization: "EPSG", code: 4326 };
  // The GeoPackage tables as the spec defines them, so recovery meets the same layouts as in real files.
  db.run(`
    CREATE TABLE gpkg_spatial_ref_sys (srs_name TEXT NOT NULL, srs_id INTEGER NOT NULL PRIMARY KEY, organization TEXT NOT NULL,
      organization_coordsys_id INTEGER NOT NULL, definition TEXT NOT NULL, description TEXT);
    CREATE TABLE gpkg_contents (table_name TEXT NOT NULL PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE,
      description TEXT DEFAULT '', last_change DATETIME, min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE, srs_id INTEGER);
    CREATE TABLE gpkg_geometry_columns (table_name TEXT NOT NULL, column_name TEXT NOT NULL, geometry_type_name TEXT NOT NULL,
      srs_id INTEGER NOT NULL, z TINYINT NOT NULL, m TINYINT NOT NULL);
    CREATE TABLE gpkg_ogr_contents (table_name TEXT NOT NULL PRIMARY KEY, feature_count INTEGER DEFAULT NULL);
    CREATE TABLE "${table}" (fid INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, geom BLOB, osm_id TEXT, code INTEGER, fclass TEXT, name TEXT
      ${options.withType ? ", type TEXT" : ""});
  `);
  db.run(`INSERT INTO gpkg_spatial_ref_sys VALUES ('fixture', ?, ?, ?, 'undefined', NULL)`, [srs.id, srs.organization, srs.code]);
  db.run(`INSERT INTO gpkg_contents VALUES (?, 'features', ?, '', '2026-09-23T15:41:00Z', 6.4, 4.3, 7.6, 5.7, ?)`, [table, table, srs.id]);
  db.run(`INSERT INTO gpkg_geometry_columns VALUES (?, 'geom', 'GEOMETRY', ?, 0, 0)`, [table, srs.id]);
  if (options.featureCount !== undefined) db.run(`INSERT INTO gpkg_ogr_contents VALUES (?, ?)`, [table, options.featureCount]);
  for (const row of rows) {
    const values = [row.geom ? gpkgBlob(row.geom, srs.id) : null, row.osm_id, row.fclass, row.name ?? null];
    if (options.withType) {
      db.run(`INSERT INTO "${table}" (geom, osm_id, code, fclass, name, type) VALUES (?, ?, 1500, ?, ?, ?)`, [...values, row.type ?? null]);
    } else {
      db.run(`INSERT INTO "${table}" (geom, osm_id, code, fclass, name) VALUES (?, ?, 2000, ?, ?)`, values);
    }
  }
  if (options.trailingPages) {
    db.run(`CREATE TABLE rtree_stand_in (id INTEGER PRIMARY KEY, node BLOB)`);
    for (let i = 0; i < options.trailingPages; i += 1) {
      db.run(`INSERT INTO rtree_stand_in (node) VALUES (?)`, [new Uint8Array(FIXTURE_PAGE_SIZE - 200)]);
    }
  }
  const bytes = db.export();
  db.close();
  return Buffer.from(bytes);
}

/** The file as an interrupted copy leaves it: the header still claims the full size. */
export function cutShort(file: Buffer, pages: number): Buffer {
  return Buffer.from(file.subarray(0, file.length - pages * FIXTURE_PAGE_SIZE));
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
