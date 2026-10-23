import { fileError } from "./file-error";
import { MAX_IMPORT_ROWS, uniqueHeadings } from "./reader-limits";

/**
 * Reads a shapefile's attribute table (.dbf, dBASE III/IV). The header gives the record count
 * and size and lists the columns; each record is a deletion flag byte followed by the columns'
 * fixed-width text. Every value comes back as text, as the other readers do. Memo and binary
 * column types are skipped (and reported), because the platform's shapefiles don't use them.
 */

const HEADER_BYTES = 32;
const FIELD_BYTES = 32;
const HEADER_END = 0x0d;
const DELETED = 0x2a;

/** Column types read as text: character, numeric, float, date, logical. */
const READABLE_TYPES = new Set(["C", "N", "F", "D", "L"]);

/** dBASE "language driver" bytes that mean Windows Latin-1, the usual Western European default. */
const LATIN1_DRIVERS = new Set([0x03, 0x57, 0x58, 0x59]);

export interface DbfTable {
  headings: string[];
  /** One per record, in file order; null where the record is flagged as deleted. */
  rows: (Record<string, string | null> | null)[];
  /** Columns left out because their type (memo, binary) isn't read. */
  skipped: string[];
}

interface DbfField {
  name: string;
  type: string;
  at: number;
  length: number;
}

/** `cpg` is the text of the optional .cpg file next to the .dbf, naming the character encoding. */
export function parseDbf(buffer: Buffer, cpg: string | null): DbfTable {
  if (buffer.length < HEADER_BYTES) throw fileError("The .dbf attribute table is too short to be valid.");
  const count = buffer.readUInt32LE(4);
  const headerBytes = buffer.readUInt16LE(8);
  const recordBytes = buffer.readUInt16LE(10);
  if (headerBytes < HEADER_BYTES + 1 || headerBytes > buffer.length || recordBytes < 1) {
    throw fileError("The .dbf attribute table's header is damaged, so it can't be read.");
  }
  if (count > MAX_IMPORT_ROWS) throw fileError(`The attribute table has more than ${MAX_IMPORT_ROWS} records; split the file into smaller files.`);
  if (headerBytes + count * recordBytes > buffer.length) {
    throw fileError(`The .dbf says it has ${count} records but the file is cut short. Upload it again.`);
  }

  const decoder = decoderFor(buffer, cpg, headerBytes, count * recordBytes);

  const fields: DbfField[] = [];
  let at = 1; // byte 0 of each record is the deletion flag
  for (let d = HEADER_BYTES; d + FIELD_BYTES <= headerBytes && buffer[d] !== HEADER_END; d += FIELD_BYTES) {
    const nameBytes = buffer.subarray(d, d + 11);
    const nameEnd = nameBytes.indexOf(0);
    const length = buffer[d + 16]!;
    fields.push({
      name: decoder.decode(nameEnd === -1 ? nameBytes : nameBytes.subarray(0, nameEnd)).trim(),
      type: String.fromCharCode(buffer[d + 11]!).toUpperCase(),
      at,
      length,
    });
    at += length;
  }
  if (at > recordBytes) throw fileError("The .dbf attribute table's column definitions don't fit its records, so it can't be read.");

  const readable = fields.filter((field) => READABLE_TYPES.has(field.type) && field.name);
  const skipped = fields.filter((field) => !readable.includes(field)).map((field) => field.name || "(unnamed)");
  const headings = uniqueHeadings(readable.map((field) => field.name));

  const rows: DbfTable["rows"] = [];
  for (let i = 0; i < count; i++) {
    const start = headerBytes + i * recordBytes;
    if (buffer[start] === DELETED) {
      rows.push(null);
      continue;
    }
    const row: Record<string, string | null> = {};
    readable.forEach((field, index) => {
      row[headings[index]!] = readValue(decoder.decode(buffer.subarray(start + field.at, start + field.at + field.length)), field.type);
    });
    rows.push(row);
  }
  return { headings, rows, skipped };
}

function readValue(text: string, type: string): string | null {
  const value = text.replace(/\0/g, "").trim();
  if (!value) return null;
  switch (type) {
    case "D":
      return /^\d{8}$/.test(value) && value !== "00000000" ? `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}` : null;
    case "L":
      return /^[TtYy]$/.test(value) ? "true" : /^[FfNn]$/.test(value) ? "false" : null;
    case "N":
    case "F":
      // Overflowed numbers are stored as a run of asterisks.
      return /^\*+$/.test(value) ? null : value;
    default:
      return value;
  }
}

/**
 * The text encoding: the .cpg file if it names one we know, else the header's language driver,
 * else UTF-8 when the records are valid UTF-8, else Windows Latin-1 (the old default for
 * shapefiles made in Excel-era GIS tools, and the only other encoding most of this data uses).
 */
function decoderFor(buffer: Buffer, cpg: string | null, recordsAt: number, recordsLength: number): TextDecoder {
  const named = cpg ? decoder(cpgLabel(cpg)) : null;
  if (named) return named;
  if (LATIN1_DRIVERS.has(buffer[29]!)) return new TextDecoder("windows-1252");
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(recordsAt, recordsAt + recordsLength));
    return new TextDecoder("utf-8");
  } catch {
    return new TextDecoder("windows-1252");
  }
}

function decoder(label: string): TextDecoder | null {
  try {
    return new TextDecoder(label);
  } catch {
    return null;
  }
}

/** ".cpg" files hold a name ("UTF-8", "ISO-8859-1") or a Windows code page number ("1252", "ANSI 1252"). */
function cpgLabel(cpg: string): string {
  const text = cpg.replace(/^﻿/, "").trim().toLowerCase();
  const codePage = /^(?:ansi |cp|windows-)?(125\d)$/.exec(text);
  return codePage ? `windows-${codePage[1]}` : text;
}
