import initSqlJs from "sql.js";
import { ValidationError } from "../../common/errors/app-error";

/**
 * Reads what is left of a GeoPackage that was cut short (an interrupted copy). SQLite can't
 * open such a file: its own table of contents (sqlite_master) points into the missing tail. The
 * rows that did arrive are still intact on their pages, so this reads the file page by page, the
 * way SQLite's own `.recover` command does:
 *
 *  1. every table leaf page that is present is decoded into records;
 *  2. the GeoPackage's own bookkeeping rows (gpkg_contents, gpkg_geometry_columns,
 *     gpkg_spatial_ref_sys) and the feature table's CREATE TABLE statement are found among them,
 *     which gives the table's columns, geometry column and CRS;
 *  3. every record with exactly that layout and a GeoPackage geometry is a feature row.
 *
 * Rows are counted first and then streamed (`rows()` decodes the pages again), so a 400,000-row
 * file is never held in memory as objects. A row whose payload continues on a missing page is
 * left out and counted. Rows that lived only on missing pages are simply gone; GDAL's recorded
 * feature count, when it survived, says whether any are.
 *
 * File format: https://www.sqlite.org/fileformat.html
 */

export interface RecoveredGeoPackage {
  tableName: string;
  geometryColumn: string;
  /** e.g. "EPSG:4326", or null when the CRS rows were in the missing part. */
  crs: string | null;
  /** Feature rows found on the pages that arrived. */
  foundRows: number;
  /**
   * How many rows the table should hold, when the file still records it: GDAL's feature count
   * (gpkg_ogr_contents), else the last id handed out (sqlite_sequence). Null when neither survived.
   */
  expectedRows: number | null;
  /** Records found but unreadable because part of their data was on a missing page (any table). */
  incompleteRows: number;
  pagesPresent: number;
  pagesExpected: number;
  /** The feature rows, columns by name, the geometry still as its GeoPackage blob. Decodes the pages again on each call. */
  rows(): Generator<Record<string, unknown>>;
}

type Value = null | number | string | Uint8Array;

interface Cell {
  rowid: number;
  values: Value[];
}

export async function recoverGeoPackage(buffer: Buffer, fileName: string): Promise<RecoveredGeoPackage> {
  const pageSize = buffer.readUInt16BE(16) === 1 ? 65_536 : buffer.readUInt16BE(16);
  const usable = pageSize - buffer.readUInt8(20);
  const pagesPresent = Math.floor(buffer.length / pageSize);
  const pagesExpected = Math.max(buffer.readUInt32BE(28), pagesPresent);
  const reader = new PageReader(buffer, pageSize, usable, pagesPresent);

  // Pass 1: the bookkeeping. Every table it needs starts with a text column; feature rows (NULL
  // id) and spatial-index rows (integer id) don't, so they aren't kept.
  const records: Cell[] = [];
  for (const cell of reader.leafCells()) if (typeof cell.values[0] === "string") records.push(cell);
  const textAt = (cell: Cell, index: number) => {
    const value = cell.values[index];
    return typeof value === "string" ? value : null;
  };

  // gpkg_contents rows: (table_name, data_type, identifier, description, last_change, min_x, min_y, max_x, max_y, srs_id)
  const featureTables = new Set(
    records.filter((cell) => cell.values.length === 10 && textAt(cell, 1) === "features").map((cell) => textAt(cell, 0)!),
  );
  // sqlite_master rows: (type, name, tbl_name, rootpage, sql)
  const createStatements = records.filter(
    (cell) => cell.values.length === 5 && textAt(cell, 0) === "table" && featureTables.has(textAt(cell, 1) ?? "") && textAt(cell, 4),
  );
  if (createStatements.length !== 1) {
    throw unrecoverable(fileName, "the part that describes its feature table is in the missing piece");
  }
  const tableName = textAt(createStatements[0]!, 1)!;
  const columns = await columnsOf(textAt(createStatements[0]!, 4)!);

  // gpkg_geometry_columns rows: (table_name, column_name, geometry_type_name, srs_id, z, m)
  const geometryRow = records.find((cell) => cell.values.length === 6 && textAt(cell, 0) === tableName && textAt(cell, 1));
  if (!geometryRow) throw unrecoverable(fileName, "the part that names its geometry column is in the missing piece");
  const geometryColumn = textAt(geometryRow, 1)!;
  const geometryIndex = columns.names.indexOf(geometryColumn);
  if (geometryIndex < 0) throw unrecoverable(fileName, `its feature table has no column named ${geometryColumn}`);

  // gpkg_spatial_ref_sys rows: (srs_name, srs_id, organization, organization_coordsys_id, definition, description).
  // srs_id is the table's INTEGER PRIMARY KEY, so it is stored as the rowid and the column holds NULL.
  const srsId = geometryRow.values[3];
  const srsRow = records.find(
    (cell) =>
      cell.values.length >= 5 &&
      (cell.values[1] === srsId || (cell.values[1] === null && cell.rowid === srsId)) &&
      typeof cell.values[2] === "string" &&
      typeof cell.values[3] === "number",
  );
  const crs = srsRow ? `${textAt(srsRow, 2)}:${srsRow.values[3]}` : null;

  // gpkg_ogr_contents (table_name, feature_count) and sqlite_sequence (name, seq) are both two
  // columns: the table's name, then a count. GDAL's feature count is the better of the two.
  const counts = records
    .filter((cell) => cell.values.length === 2 && cell.values[0] === tableName && typeof cell.values[1] === "number")
    .map((cell) => cell.values[1] as number);
  const expectedRows = counts.length > 0 ? Math.max(...counts) : null;

  const rows = function* (): Generator<Record<string, unknown>> {
    // A page can survive twice (a freed copy); the rowid tells them apart.
    const seen = new Set<number>();
    for (const cell of reader.leafCells()) {
      if (cell.values.length !== columns.names.length) continue;
      const geometry = cell.values[geometryIndex];
      if (!(geometry instanceof Uint8Array) || geometry[0] !== 0x47 || geometry[1] !== 0x50) continue;
      if (seen.has(cell.rowid)) continue;
      seen.add(cell.rowid);
      const row: Record<string, unknown> = {};
      columns.names.forEach((name, index) => {
        row[name] = index === columns.rowidAlias ? cell.rowid : cell.values[index];
      });
      yield row;
    }
  };

  // Pass 2: count the rows (and the unreadable records) before anything is loaded.
  reader.incompleteRows = 0;
  let foundRows = 0;
  for (const _row of rows()) foundRows += 1;

  return { tableName, geometryColumn, crs, foundRows, expectedRows, incompleteRows: reader.incompleteRows, pagesPresent, pagesExpected, rows };
}

/** The recovered rows as one array, in id order. For tests and small files; loaders stream `rows()`. */
export async function recoverGeoPackageRows(
  buffer: Buffer,
  fileName: string,
): Promise<Omit<RecoveredGeoPackage, "rows"> & { rows: Record<string, unknown>[] }> {
  const recovered = await recoverGeoPackage(buffer, fileName);
  const rows = [...recovered.rows()];
  const idColumn = Object.keys(rows[0] ?? {})[0] ?? "";
  rows.sort((a, b) => Number(a[idColumn]) - Number(b[idColumn]));
  return { ...recovered, rows };
}

/** The column names of a CREATE TABLE statement, read by SQLite itself rather than parsed by hand. */
async function columnsOf(createSql: string): Promise<{ names: string[]; rowidAlias: number }> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  try {
    db.run(createSql);
    const name = /^\s*CREATE\s+TABLE\s+("(?:[^"]|"")+"|\S+)/i.exec(createSql)?.[1] ?? "";
    const info = db.exec(`PRAGMA table_info(${name})`)[0]?.values ?? [];
    const names = info.map((column) => String(column[1]));
    // An INTEGER PRIMARY KEY column is stored as NULL in the record: its value is the rowid.
    const rowidAlias = info.findIndex((column) => Number(column[5]) === 1 && String(column[2]).toUpperCase() === "INTEGER");
    return { names, rowidAlias };
  } finally {
    db.close();
  }
}

function unrecoverable(fileName: string, why: string): ValidationError {
  return new ValidationError([{ field: fileName, message: `${fileName} is cut short and can't be recovered: ${why}.` }]);
}

/** Decodes SQLite table b-tree leaf pages into records. */
class PageReader {
  incompleteRows = 0;

  constructor(
    private readonly buffer: Buffer,
    private readonly pageSize: number,
    private readonly usable: number,
    private readonly pagesPresent: number,
  ) {}

  *leafCells(): Generator<Cell> {
    for (let page = 1; page <= this.pagesPresent; page += 1) {
      const start = (page - 1) * this.pageSize;
      const header = start + (page === 1 ? 100 : 0);
      if (this.buffer[header] !== 0x0d) continue; // 13 = table b-tree leaf
      const cellCount = this.buffer.readUInt16BE(header + 3);
      for (let i = 0; i < cellCount; i += 1) {
        const pointer = this.buffer.readUInt16BE(header + 8 + 2 * i);
        if (pointer < 8 || pointer >= this.pageSize) continue;
        let cell: Cell | null = null;
        try {
          cell = this.cell(start, start + pointer);
        } catch {
          // A cell that can't be decoded is skipped; the others on the page still count.
        }
        if (cell) yield cell;
      }
    }
  }

  private cell(pageStart: number, offset: number): Cell | null {
    const [payloadSize, afterSize] = readVarint(this.buffer, offset);
    const [rowid, afterRowid] = readVarint(this.buffer, afterSize);
    const payload = this.payload(pageStart, afterRowid, payloadSize);
    if (!payload) {
      this.incompleteRows += 1;
      return null;
    }
    return { rowid, values: decodeRecord(payload) };
  }

  /** The cell's payload, following its overflow pages; null if one of them is missing. */
  private payload(pageStart: number, offset: number, size: number): Buffer | null {
    const maxLocal = this.usable - 35;
    if (size <= maxLocal) {
      if (offset + size > pageStart + this.pageSize) return null;
      return this.buffer.subarray(offset, offset + size);
    }
    const minLocal = Math.floor(((this.usable - 12) * 32) / 255) - 23;
    const surplus = minLocal + ((size - minLocal) % (this.usable - 4));
    const local = surplus <= maxLocal ? surplus : minLocal;
    const parts = [this.buffer.subarray(offset, offset + local)];
    let remaining = size - local;
    let next = this.buffer.readUInt32BE(offset + local);
    while (remaining > 0) {
      if (next < 1 || next > this.pagesPresent) return null;
      const start = (next - 1) * this.pageSize;
      const take = Math.min(remaining, this.usable - 4);
      parts.push(this.buffer.subarray(start + 4, start + 4 + take));
      remaining -= take;
      next = this.buffer.readUInt32BE(start);
    }
    return Buffer.concat(parts);
  }
}

/** SQLite's variable-length integer: up to 9 bytes, 7 bits each except a full 9th byte. */
function readVarint(buffer: Buffer, offset: number): [number, number] {
  let value = 0;
  for (let i = 0; i < 8; i += 1) {
    const byte = buffer[offset + i]!;
    value = value * 128 + (byte & 0x7f);
    if ((byte & 0x80) === 0) return [value, offset + i + 1];
  }
  return [value * 256 + buffer[offset + 8]!, offset + 9];
}

/** A record: a header of serial types, then the values. https://www.sqlite.org/fileformat.html#record_format */
function decodeRecord(payload: Buffer): Value[] {
  const [headerSize, firstType] = readVarint(payload, 0);
  const types: number[] = [];
  let cursor = firstType;
  while (cursor < headerSize) {
    const [type, next] = readVarint(payload, cursor);
    types.push(type);
    cursor = next;
  }

  let at = headerSize;
  const values: Value[] = [];
  for (const type of types) {
    if (type === 0) values.push(null);
    else if (type >= 1 && type <= 6) {
      const width = [0, 1, 2, 3, 4, 6, 8][type]!;
      values.push(width === 8 ? Number(payload.readBigInt64BE(at)) : payload.readIntBE(at, width));
      at += width;
    } else if (type === 7) {
      values.push(payload.readDoubleBE(at));
      at += 8;
    } else if (type === 8 || type === 9) values.push(type - 8);
    else if (type >= 12 && type % 2 === 0) {
      const length = (type - 12) / 2;
      values.push(new Uint8Array(payload.subarray(at, at + length)));
      at += length;
    } else if (type >= 13) {
      const length = (type - 13) / 2;
      values.push(payload.toString("utf8", at, at + length));
      at += length;
    } else {
      throw new Error(`reserved serial type ${type}`);
    }
    if (at > payload.length) throw new Error("record runs past its payload");
  }
  return values;
}
