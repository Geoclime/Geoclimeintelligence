import { unzipSync } from "fflate";
import { ValidationError } from "../../../../common/errors/app-error";
import type { UploadedFile } from "../import.types";
import { fileError } from "./file-error";
import { MAX_UNZIPPED_BYTES } from "./reader-limits";
import type { ShapefileParts } from "./shapefile-reader";

/** File extensions a zip may hold as its data, best first: a shapefile outranks the rest. */
const DATA_EXTENSIONS = [".shp", ".xlsx", ".geojson", ".json", ".csv", ".tsv"];

export type ZipContents = { shapefile: ShapefileParts } | { file: UploadedFile };

/** The names inside a zip, read from its directory without unpacking anything. */
export function listZipNames(buffer: Buffer): string[] {
  const names: string[] = [];
  try {
    unzipSync(buffer, {
      filter: (entry) => {
        names.push(entry.name);
        return false;
      },
    });
  } catch {
    throw fileError("The zip file could not be opened. Re-create it and try again.");
  }
  return names;
}

/** An .xlsx workbook is itself a zip; these entries tell it apart from a bundle of files. */
export function isWorkbook(names: string[]): boolean {
  return names.includes("[Content_Types].xml") && names.some((name) => name.startsWith("xl/"));
}

/**
 * Opens a zip of geographic data and finds the one dataset in it: a shapefile (its .dbf, .prj
 * and .cpg are taken from beside it), or a single .xlsx, .geojson/.json or .csv. Nothing is
 * written to disk; only the files that are read are unpacked, and never past the unpack limit,
 * whatever sizes the zip claims.
 */
export function openZip(buffer: Buffer): ZipContents {
  const names = listZipNames(buffer).filter((name) => !name.endsWith("/") && !isJunk(name));
  const byExtension = (extension: string) => names.filter((name) => name.toLowerCase().endsWith(extension));

  const shapefiles = byExtension(".shp");
  if (shapefiles.length > 1) {
    throw fileError(`The zip holds ${shapefiles.length} shapefiles (${shapefiles.join(", ")}). Upload them one at a time.`);
  }
  if (shapefiles.length === 1) {
    const shp = shapefiles[0]!;
    const stem = shp.slice(0, -".shp".length).toLowerCase();
    const sibling = (extension: string) => names.find((name) => name.toLowerCase() === `${stem}${extension}`);
    const wanted = { shp, dbf: sibling(".dbf"), prj: sibling(".prj"), cpg: sibling(".cpg") };
    const files = unpack(buffer, Object.values(wanted).filter((name): name is string => Boolean(name)));
    return {
      shapefile: {
        shp: files.get(shp)!,
        dbf: wanted.dbf ? files.get(wanted.dbf) : undefined,
        prj: wanted.prj ? files.get(wanted.prj) : undefined,
        cpg: wanted.cpg ? files.get(wanted.cpg) : undefined,
      },
    };
  }

  const candidates = DATA_EXTENSIONS.flatMap(byExtension);
  if (candidates.length === 0) {
    throw fileError(
      "The zip has nothing this system can read. Expected a shapefile (.shp with its .dbf and .prj), an Excel workbook (.xlsx), a GeoJSON file or a CSV file.",
    );
  }
  if (candidates.length > 1) {
    throw fileError(`The zip holds several data files (${candidates.join(", ")}). Upload one at a time.`);
  }
  const name = candidates[0]!;
  return { file: { originalName: name.split("/").pop()!, buffer: unpack(buffer, [name]).get(name)! } };
}

/** Unpacks just these entries, refusing any that would take the total past the limit. */
function unpack(buffer: Buffer, wanted: string[]): Map<string, Buffer> {
  const names = new Set(wanted);
  let claimed = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buffer, {
      filter: (entry) => {
        if (!names.has(entry.name)) return false;
        claimed += entry.originalSize;
        if (claimed > MAX_UNZIPPED_BYTES) {
          throw fileError(`The zip unpacks to more than ${MAX_UNZIPPED_BYTES / (1024 * 1024)} MB; split the data into smaller files.`);
        }
        return true;
      },
    });
  } catch (err) {
    if (err instanceof ValidationError) throw err; // the size limit's own 400
    throw fileError("The zip file could not be unpacked. Re-create it and try again.");
  }
  return new Map(Object.entries(files).map(([name, bytes]) => [name, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)]));
}

/** Files that zip tools add on their own (macOS resource forks, hidden files). */
function isJunk(name: string): boolean {
  return name.startsWith("__MACOSX/") || (name.split("/").pop() ?? "").startsWith(".");
}
