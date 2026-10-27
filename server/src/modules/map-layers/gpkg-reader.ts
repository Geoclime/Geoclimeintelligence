import initSqlJs from "sql.js";
import { ValidationError } from "../../common/errors/app-error";
import { assertWgs84Crs } from "../data-sources/imports/readers/geojson-reader";
import { parseGpkgGeometry } from "./gpkg-geometry";
import type { LayerFeature } from "./map-layer-rows";

/**
 * Reads the features of a GeoPackage (.gpkg), the format Geofabrik's OpenStreetMap extracts come
 * in. A GeoPackage is a SQLite database; sql.js reads it in memory (WebAssembly, so nothing
 * native to build on the server). Each row becomes a LayerFeature: its columns are the
 * properties and its geometry is decoded to GeoJSON, so it goes through the same checks as a
 * GeoJSON feature. Like the GeoJSON reader, a CRS other than WGS84 is refused (rule 7).
 */

let sqlJs: ReturnType<typeof initSqlJs> | undefined;

const SQLITE_MAGIC = "SQLite format 3\u0000";

export function isGeoPackage(buffer: Buffer): boolean {
  return buffer.subarray(0, 16).toString("latin1") === SQLITE_MAGIC;
}

export async function readGeoPackage(buffer: Buffer, fileName: string): Promise<LayerFeature[]> {
  if (!isGeoPackage(buffer)) throw fileError(fileName, "is not a GeoPackage (a .gpkg file is a SQLite database)");
  assertComplete(buffer, fileName);

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
    // Unlike GeoJSON, a GeoPackage always names its CRS; an undefined one is never taken as WGS84.
    if (typeof crs !== "string" || !isWgs84(crs)) {
      throw fileError(
        fileName,
        `is in ${typeof crs === "string" ? crs : "an undefined CRS"}. Only EPSG:4326 (WGS84) is accepted: re-project the file first`,
      );
    }

    const features: LayerFeature[] = [];
    const statement = db.prepare(`SELECT * FROM "${table.name.replaceAll('"', '""')}"`);
    try {
      while (statement.step()) {
        const row = statement.getAsObject();
        const properties: Record<string, unknown> = {};
        for (const [column, value] of Object.entries(row)) {
          if (column !== table.geometryColumn) properties[column] = value;
        }
        const blob = row[table.geometryColumn];
        features.push({ properties, geometry: parseGpkgGeometry(blob instanceof Uint8Array ? blob : null) });
      }
    } finally {
      statement.free();
    }
    return features;
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw damaged(fileName);
  } finally {
    db.close();
  }
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
 * A copy cut off part-way (an interrupted download or upload) still opens, then fails with a
 * vague "malformed" error. The SQLite header records the database's size, so this case gets
 * its own clear message. Spec: https://www.sqlite.org/fileformat.html#the_database_header
 */
function assertComplete(buffer: Buffer, fileName: string): void {
  if (buffer.length < 100) throw damaged(fileName);
  const rawPageSize = buffer.readUInt16BE(16);
  const pageSize = rawPageSize === 1 ? 65_536 : rawPageSize;
  const changeCounter = buffer.readUInt32BE(24);
  const pageCount = buffer.readUInt32BE(28);
  const validFor = buffer.readUInt32BE(92);
  // The size field is only trustworthy when it was written by the same change as the counter.
  if (pageCount === 0 || validFor !== changeCounter) return;
  const expected = pageCount * pageSize;
  if (buffer.length < expected) {
    const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
    throw fileError(
      fileName,
      `is cut short: it should be ${mb(expected)} MB but is ${mb(buffer.length)} MB. Ask for a fresh copy of the file`,
    );
  }
}

function isWgs84(crsName: string): boolean {
  try {
    assertWgs84Crs(crsName);
    return true;
  } catch {
    return false;
  }
}

function damaged(fileName: string): ValidationError {
  return fileError(fileName, "could not be read: the GeoPackage is damaged. Ask for a fresh copy of the file");
}

function fileError(fileName: string, problem: string): ValidationError {
  return new ValidationError([{ field: fileName, message: `${fileName} ${problem}.` }]);
}
