import initSqlJs from "sql.js";
import { ValidationError } from "../../common/errors/app-error";
import { assertWgs84Crs } from "../data-sources/imports/readers/geojson-reader";
import { parseGpkgGeometry } from "./gpkg-geometry";
import { recoverGeoPackage } from "./gpkg-recover";
import type { LayerFeature } from "./map-layer-rows";

/**
 * Reads the features of a GeoPackage (.gpkg), the format Geofabrik's OpenStreetMap extracts come
 * in. A GeoPackage is a SQLite database; sql.js reads it in memory (WebAssembly, so nothing
 * native to build on the server). Each row becomes a LayerFeature: its columns are the
 * properties and its geometry is decoded to GeoJSON, so it goes through the same checks as a
 * GeoJSON feature. Like the GeoJSON reader, a CRS other than WGS84 is refused (rule 7).
 *
 * Features are streamed (openGeoPackage), so a 258,000-building file is never held in memory as
 * objects; readGeoPackage collects them for the small files.
 *
 * A file cut short in transit can't be opened by SQLite, but its rows are usually all there
 * (the missing end tends to be the spatial index, written last). Such a file is read page by
 * page (gpkg-recover.ts) and accepted when every row it records was recovered. When rows are
 * missing, it is refused unless the caller accepts a partial load; either way the result says
 * what happened, for the load report.
 */

export interface OpenGeoPackage {
  /** How many features the file holds (or, for a recovered file, how many were recovered). */
  featureCount: number;
  /** Anything the person loading should know, e.g. that the file was recovered. */
  notes: string[];
  /** The features, one at a time. Call `close()` when done, even if the loop stops early. */
  features(): Generator<LayerFeature>;
  close(): void;
}

export interface GeoPackageRead {
  features: LayerFeature[];
  notes: string[];
}

export interface ReadOptions {
  /** Load a cut-short file even if some of its rows are missing (they are reported). */
  acceptPartial?: boolean;
}

let sqlJs: ReturnType<typeof initSqlJs> | undefined;

const SQLITE_MAGIC = "SQLite format 3\u0000";

export function isGeoPackage(buffer: Buffer): boolean {
  return buffer.subarray(0, 16).toString("latin1") === SQLITE_MAGIC;
}

/** Every feature at once. For the small files (facilities); buildings use openGeoPackage. */
export async function readGeoPackage(buffer: Buffer, fileName: string, options: ReadOptions = {}): Promise<GeoPackageRead> {
  const file = await openGeoPackage(buffer, fileName, options);
  try {
    return { features: [...file.features()], notes: file.notes };
  } finally {
    file.close();
  }
}

export async function openGeoPackage(buffer: Buffer, fileName: string, options: ReadOptions = {}): Promise<OpenGeoPackage> {
  if (!isGeoPackage(buffer) || buffer.length < 100) throw fileError(fileName, "is not a GeoPackage (a .gpkg file is a SQLite database)");
  const shortfall = cutShort(buffer);
  if (shortfall) return openCutShort(buffer, fileName, shortfall, options);

  const SQL = await (sqlJs ??= initSqlJs());
  let db: initSqlJs.Database;
  try {
    db = new SQL.Database(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  } catch {
    throw damaged(fileName);
  }

  try {
    const table = featureTable(db, fileName);
    const crs = db.exec(
      `SELECT s.organization || ':' || s.organization_coordsys_id
         FROM gpkg_geometry_columns g JOIN gpkg_spatial_ref_sys s ON s.srs_id = g.srs_id
        WHERE g.table_name = ? AND g.column_name = ?`,
      [table.name, table.geometryColumn],
    )[0]?.values[0]?.[0];
    assertWgs84(fileName, typeof crs === "string" ? crs : null);
    const quoted = `"${table.name.replaceAll('"', '""')}"`;
    const featureCount = Number(db.exec(`SELECT count(*) FROM ${quoted}`)[0]?.values[0]?.[0] ?? 0);

    return {
      featureCount,
      notes: [],
      *features() {
        const statement = db.prepare(`SELECT * FROM ${quoted}`);
        try {
          while (statement.step()) yield toFeature(statement.getAsObject(), table.geometryColumn);
        } catch (err) {
          throw err instanceof ValidationError ? err : damaged(fileName);
        } finally {
          statement.free();
        }
      },
      close: () => db.close(),
    };
  } catch (err) {
    db.close();
    if (err instanceof ValidationError) throw err;
    throw damaged(fileName);
  }
}

async function openCutShort(
  buffer: Buffer,
  fileName: string,
  { expectedBytes }: { expectedBytes: number },
  options: ReadOptions,
): Promise<OpenGeoPackage> {
  const recovered = await recoverGeoPackage(buffer, fileName);
  if (!recovered.crs) throw fileError(fileName, `is cut short (${sizes(expectedBytes, buffer.length)}), and the record of its CRS is in the missing part`);
  assertWgs84(fileName, recovered.crs);

  const found = recovered.foundRows;
  const expected = recovered.expectedRows;
  // GDAL's own count is the proof: unreadable records elsewhere (the index) don't matter if it matches.
  const complete = expected !== null && found >= expected;
  const count = (n: number) => n.toLocaleString("en");
  let note: string;
  if (complete) {
    note = `${fileName} was cut short (${sizes(expectedBytes, buffer.length)}), but all ${count(found)} of its rows were in the part that arrived; only its index was missing.`;
  } else {
    const of = expected === null ? "an unknown number" : count(expected);
    const damagedRows = recovered.incompleteRows > 0 ? ` (${count(recovered.incompleteRows)} records were damaged)` : "";
    note = `${fileName} was cut short (${sizes(expectedBytes, buffer.length)}): ${count(found)} of ${of} rows were recovered${damagedRows}; the rest are missing.`;
    if (!options.acceptPartial) {
      throw fileError(
        fileName,
        `is cut short (${sizes(expectedBytes, buffer.length)}): only ${count(found)} of ${of} rows could be recovered${damagedRows}. Ask for a fresh copy, or load what is there on purpose (--accept-partial, or "Load even if rows are missing" on the Imports screen)`,
      );
    }
  }

  return {
    featureCount: found,
    notes: [note],
    *features() {
      for (const row of recovered.rows()) yield toFeature(row, recovered.geometryColumn);
    },
    close: () => undefined,
  };
}

function toFeature(row: Record<string, unknown>, geometryColumn: string): LayerFeature {
  const properties: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(row)) {
    if (column !== geometryColumn) properties[column] = value;
  }
  const blob = row[geometryColumn];
  return { properties, geometry: parseGpkgGeometry(blob instanceof Uint8Array ? blob : null) };
}

/** The one feature table the file holds, and its geometry column. Geofabrik files have exactly one. */
function featureTable(db: initSqlJs.Database, fileName: string): { name: string; geometryColumn: string } {
  let rows: unknown[][];
  try {
    rows =
      db.exec(
        `SELECT c.table_name, g.column_name
           FROM gpkg_contents c JOIN gpkg_geometry_columns g ON g.table_name = c.table_name
          WHERE c.data_type = 'features'`,
      )[0]?.values ?? [];
  } catch {
    throw fileError(fileName, "has no GeoPackage contents table (gpkg_contents), so it isn't a GeoPackage of features");
  }
  if (rows.length !== 1) {
    throw fileError(fileName, `holds ${rows.length} feature tables. The loader reads one layer per file, as Geofabrik delivers them`);
  }
  const [name, geometryColumn] = rows[0] as [string, string];
  return { name, geometryColumn };
}

/**
 * Whether the file is shorter than its SQLite header says, as an interrupted copy is. The size
 * field is only trustworthy when it was written by the same change as the change counter.
 * Spec: https://www.sqlite.org/fileformat.html#the_database_header
 */
function cutShort(buffer: Buffer): { expectedBytes: number } | null {
  const rawPageSize = buffer.readUInt16BE(16);
  const pageSize = rawPageSize === 1 ? 65_536 : rawPageSize;
  const changeCounter = buffer.readUInt32BE(24);
  const pageCount = buffer.readUInt32BE(28);
  const validFor = buffer.readUInt32BE(92);
  if (pageCount === 0 || validFor !== changeCounter) return null;
  const expectedBytes = pageCount * pageSize;
  return buffer.length < expectedBytes ? { expectedBytes } : null;
}

function sizes(expectedBytes: number, actualBytes: number): string {
  const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  return `${mb(actualBytes)} of ${mb(expectedBytes)} MB`;
}

/** Unlike GeoJSON, a GeoPackage always names its CRS; an undefined one is never taken as WGS84. */
function assertWgs84(fileName: string, crs: string | null): void {
  let ok = false;
  if (crs) {
    try {
      assertWgs84Crs(crs);
      ok = true;
    } catch {
      ok = false;
    }
  }
  if (!ok) {
    throw fileError(fileName, `is in ${crs ?? "an undefined CRS"}. Only EPSG:4326 (WGS84) is accepted: re-project the file first`);
  }
}

function damaged(fileName: string): ValidationError {
  return fileError(fileName, "could not be read: the GeoPackage is damaged. Ask for a fresh copy of the file");
}

function fileError(fileName: string, problem: string): ValidationError {
  return new ValidationError([{ field: fileName, message: `${fileName} ${problem}.` }]);
}
