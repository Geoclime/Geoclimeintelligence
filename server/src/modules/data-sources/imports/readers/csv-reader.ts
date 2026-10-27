import { parse } from "csv-parse/sync";
import type { ParsedFile, ParsedRow } from "../import.types";
import { fileError } from "./file-error";
import { MAX_IMPORT_ROWS, uniqueHeadings } from "./reader-limits";

const DELIMITERS = [",", ";", "\t", "|"] as const;

/**
 * Reads a delimited text file (CSV, or TSV and semicolon-separated files as exported by
 * Excel in many locales). The first row holds the headings and every later row is data, with
 * every value read as text. A shape travels in a column as WKT (or GeoJSON text), the same as
 * in an Excel sheet, so it needs no conversion here. Row numbers count the heading row as 1.
 */
export function readCsv(buffer: Buffer): ParsedFile {
  const text = decode(buffer);
  let records: string[][];
  try {
    records = parse(text, {
      delimiter: detectDelimiter(text),
      bom: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
    }) as string[][];
  } catch (err) {
    throw fileError(`The file could not be read as CSV: ${err instanceof Error ? err.message : "it is not valid delimited text"}.`);
  }
  if (records.length === 0) throw fileError("The file is empty.");

  const columns: { index: number; heading: string }[] = [];
  records[0]!.forEach((cell, index) => {
    const heading = cell.trim();
    if (heading) columns.push({ index, heading });
  });
  const headings = uniqueHeadings(columns.map((c) => c.heading));
  if (headings.length === 0) throw fileError("The first row of the file has no headings.");
  if (records.length - 1 > MAX_IMPORT_ROWS) throw fileError(`The file has more than ${MAX_IMPORT_ROWS} rows; split it into smaller files.`);

  const rows: ParsedRow[] = [];
  for (let r = 1; r < records.length; r++) {
    const values: Record<string, string | null> = {};
    let empty = true;
    columns.forEach(({ index }, position) => {
      const value = (records[r]![index] ?? "").trim();
      values[headings[position]!] = value || null;
      if (value) empty = false;
    });
    if (!empty) rows.push({ rowNumber: r + 1, values, geometry: null });
  }

  return { fileType: "csv", sheets: [], sheetName: null, headerRow: 1, headings, rows, warnings: [] };
}

/** UTF-8 when it is valid UTF-8, else Windows Latin-1 (what Excel's "CSV" export writes). */
function decode(buffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

/** The delimiter that appears most on the first non-empty line, outside quotes. */
function detectDelimiter(text: string): string {
  const firstLine = text.replace(/^﻿/, "").split(/\r?\n/).find((line) => line.trim()) ?? "";
  const counts = new Map<string, number>(DELIMITERS.map((d) => [d, 0]));
  let quoted = false;
  for (const char of firstLine) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && counts.has(char)) counts.set(char, counts.get(char)! + 1);
  }
  let best: string = ",";
  for (const delimiter of DELIMITERS) {
    if (counts.get(delimiter)! > counts.get(best)!) best = delimiter;
  }
  return best;
}
