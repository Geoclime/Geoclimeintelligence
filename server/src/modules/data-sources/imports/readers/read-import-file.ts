import { ValidationError } from "../../../../common/errors/app-error";
import type { ImportFileType, ParsedFile, UploadedFile } from "../import.types";
import { readGeoJson } from "./geojson-reader";
import { readXlsx, type XlsxReadOptions } from "./xlsx-reader";

/**
 * Works out what kind of file was uploaded, from its name and then its first bytes, so a
 * ".json" GeoJSON or a workbook with an odd extension still reads. Anything else is refused.
 */
export function detectFileType(file: UploadedFile): ImportFileType {
  const name = file.originalName.toLowerCase();
  if (name.endsWith(".xlsx")) return "xlsx";
  if (name.endsWith(".geojson") || name.endsWith(".json")) return "geojson";

  // .xlsx is a zip archive ("PK"); GeoJSON is a JSON object.
  if (file.buffer.subarray(0, 2).toString("latin1") === "PK") return "xlsx";
  if (file.buffer.subarray(0, 64).toString("utf8").replace(/^﻿/, "").trimStart().startsWith("{")) return "geojson";

  throw new ValidationError([
    { field: "file", message: "Upload an Excel workbook (.xlsx) or a GeoJSON file (.geojson). Other formats aren't supported yet." },
  ]);
}

export async function readImportFile(file: UploadedFile, options: XlsxReadOptions = {}): Promise<ParsedFile> {
  return detectFileType(file) === "xlsx" ? readXlsx(file.buffer, options) : readGeoJson(file.buffer);
}
