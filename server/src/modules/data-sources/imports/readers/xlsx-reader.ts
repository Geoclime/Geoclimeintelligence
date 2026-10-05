import ExcelJS from "exceljs";
import { ValidationError } from "../../../../common/errors/app-error";
import type { ParsedFile, ParsedRow } from "../import.types";
import { MAX_IMPORT_ROWS, uniqueHeadings } from "./reader-limits";

/** How far down a sheet to look for the heading row (title banners and notes sit above it). */
const HEADER_SCAN_ROWS = 20;

export interface XlsxReadOptions {
  sheetName?: string;
  /** 1-based Excel row number holding the headings; detected when omitted. */
  headerRow?: number;
}

/**
 * Reads one sheet of an .xlsx workbook with exceljs (section 4: chosen over the `xlsx`
 * package for its security history). Every cell is read as its displayed text, so a WKT shape
 * column is read directly, with no conversion to GeoJSON first.
 */
export async function readXlsx(buffer: Buffer, options: XlsxReadOptions = {}): Promise<ParsedFile> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs's typings predate Node's generic Buffer; the bytes are what it needs.
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw fileError("The file could not be read as an Excel workbook (.xlsx). Save it as .xlsx and try again.");
  }

  const sheets = workbook.worksheets.map((sheet) => sheet.name);
  const sheet = options.sheetName
    ? workbook.getWorksheet(options.sheetName)
    : (workbook.getWorksheet("Areas") ?? workbook.worksheets[0]);
  if (!sheet) {
    throw new ValidationError([
      {
        field: "sheetName",
        message: options.sheetName
          ? `There is no sheet called "${options.sheetName}". Sheets in this file: ${sheets.join(", ")}`
          : "The workbook has no sheets",
      },
    ]);
  }

  const headerRow = options.headerRow ?? detectHeaderRow(sheet);
  if (headerRow < 1 || headerRow > sheet.rowCount) {
    throw new ValidationError([{ field: "headerRow", message: `Row ${headerRow} is outside the sheet (1-${sheet.rowCount})` }]);
  }

  // Column number -> heading; columns with a blank heading are ignored.
  const columns: { col: number; heading: string }[] = [];
  sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell, col) => {
    const heading = cell.text.trim();
    if (heading) columns.push({ col, heading });
  });
  const headings = uniqueHeadings(columns.map((c) => c.heading));
  if (headings.length === 0) {
    throw new ValidationError([{ field: "headerRow", message: `Row ${headerRow} has no headings` }]);
  }

  const rows: ParsedRow[] = [];
  for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values: Record<string, string | null> = {};
    let empty = true;
    columns.forEach(({ col }, index) => {
      const text = row.getCell(col).text.trim();
      values[headings[index]!] = text || null;
      if (text) empty = false;
    });
    if (empty) continue;
    if (rows.length >= MAX_IMPORT_ROWS) throw fileError(`The sheet has more than ${MAX_IMPORT_ROWS} rows; split it into smaller files.`);
    rows.push({ rowNumber: r, values, geometry: null });
  }

  return { fileType: "xlsx", sheets, sheetName: sheet.name, headerRow, headings, rows };
}

/**
 * The heading row is the first row, near the top, that is mostly text cells. A merged title
 * banner counts as one cell, so it never wins; data rows usually hold numbers, so they lose too.
 * The admin can override the guess on the import screen.
 */
export function detectHeaderRow(sheet: ExcelJS.Worksheet): number {
  const scan = Math.min(HEADER_SCAN_ROWS, sheet.rowCount);
  const textCounts: number[] = [];
  for (let r = 1; r <= scan; r++) {
    let count = 0;
    sheet.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
      const isMergedCopy = cell.isMerged && cell.master !== cell;
      if (!isMergedCopy && typeof cell.value === "string" && cell.value.trim()) count++;
    });
    textCounts.push(count);
  }
  const most = Math.max(0, ...textCounts);
  const threshold = Math.max(1, Math.ceil(most * 0.6));
  const index = textCounts.findIndex((count) => count >= threshold);
  return index === -1 ? 1 : index + 1;
}

function fileError(message: string): ValidationError {
  return new ValidationError([{ field: "file", message }]);
}
