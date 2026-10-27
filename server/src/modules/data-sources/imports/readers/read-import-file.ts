import type { ImportFileType, ParsedFile, UploadedFile } from "../import.types";
import { readCsv } from "./csv-reader";
import { fileError } from "./file-error";
import { readGeoJson } from "./geojson-reader";
import { looksLikeShp } from "./shp-parser";
import { readShapefile } from "./shapefile-reader";
import { readXlsx, type XlsxReadOptions } from "./xlsx-reader";
import { isWorkbook, listZipNames, openZip } from "./zip-bundle";

/** What an upload is. A zip is a bundle: what it holds decides the file type once it is opened. */
export type DetectedKind = ImportFileType | "zip";

const SUPPORTED =
  "Upload a shapefile (.shp, or a .zip of its .shp, .dbf and .prj), an Excel workbook (.xlsx), a GeoJSON file (.geojson or .json) or a CSV file (.csv).";

/** The other files of a shapefile are not a dataset on their own; say where they belong. */
const SHAPEFILE_PARTS = [".dbf", ".shx", ".prj", ".cpg", ".sbn", ".sbx", ".qix", ".qpj"];

/**
 * Works out what kind of file was uploaded, from its name and then its first bytes, so a
 * ".json" GeoJSON, a shapefile saved without its extension or a workbook with an odd name
 * still reads. Anything else is refused with a message that says what is accepted.
 */
export function detectFileType(file: UploadedFile): DetectedKind {
  const name = file.originalName.toLowerCase();
  const extension = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";

  if (extension === ".xlsx") return "xlsx";
  if (extension === ".geojson" || extension === ".json") return "geojson";
  if (extension === ".shp") return "shapefile";
  if (extension === ".csv" || extension === ".tsv") return "csv";
  if (extension === ".zip") return "zip";
  if (SHAPEFILE_PARTS.includes(extension)) {
    throw fileError(
      `A ${extension} file is only one part of a shapefile. Upload the .shp file, or zip the .shp, .dbf and .prj together and upload the .zip.`,
    );
  }

  const start = file.buffer.subarray(0, 64);
  // .xlsx and .zip are both "PK" archives; a workbook has its own entries. An archive that
  // can't be listed is left to the Excel reader, whose message says the workbook is unreadable.
  if (start.subarray(0, 2).toString("latin1") === "PK") return isWorkbookArchive(file.buffer) ? "xlsx" : "zip";
  if (looksLikeShp(file.buffer)) return "shapefile";
  const text = start.toString("utf8").replace(/^﻿/, "").trimStart();
  if (text.startsWith("{")) return "geojson";
  if (extension === ".txt" && !file.buffer.subarray(0, 4096).includes(0)) return "csv";

  throw fileError(`This file type isn't supported yet. ${SUPPORTED}`);
}

function isWorkbookArchive(buffer: Buffer): boolean {
  try {
    return isWorkbook(listZipNames(buffer));
  } catch {
    return true;
  }
}

export async function readImportFile(file: UploadedFile, options: XlsxReadOptions = {}): Promise<ParsedFile> {
  switch (detectFileType(file)) {
    case "xlsx":
      return readXlsx(file.buffer, options);
    case "geojson":
      return readGeoJson(file.buffer);
    case "shapefile":
      return readShapefile({ shp: file.buffer });
    case "csv":
      return readCsv(file.buffer);
    case "zip": {
      const contents = openZip(file.buffer);
      // A bundle never holds another zip as its data, so this recursion goes one level at most.
      return "shapefile" in contents ? readShapefile(contents.shapefile) : readImportFile(contents.file, options);
    }
  }
}
