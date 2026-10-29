import { env } from "../../../../config/env";

/** One import is one file of at most this many rows; larger datasets are split. */
export const MAX_IMPORT_ROWS = env.IMPORT_MAX_ROWS;

/** Upload size cap (multer limit). */
export const MAX_IMPORT_FILE_BYTES = env.IMPORT_MAX_FILE_MB * 1024 * 1024;

/** The most a zip upload may unpack to, counting only the files read from it. Guards against zip bombs. */
export const MAX_UNZIPPED_BYTES = env.IMPORT_MAX_UNZIPPED_MB * 1024 * 1024;

/**
 * The largest single GeoPackage a map-layer upload may unpack. Higher than MAX_UNZIPPED_BYTES
 * because these are unpacked one file at a time and streamed, not unpacked all at once:
 * Rivers State's 104 MB buildings file loads with memory peaking around 300 MB.
 */
export const MAX_GEOPACKAGE_BYTES = env.IMPORT_MAX_GPKG_MB * 1024 * 1024;

/** Makes headings unique ("name", "name (2)") so no column silently shadows another. */
export function uniqueHeadings(headings: string[]): string[] {
  const seen = new Map<string, number>();
  return headings.map((heading) => {
    const count = (seen.get(heading) ?? 0) + 1;
    seen.set(heading, count);
    return count === 1 ? heading : `${heading} (${count})`;
  });
}
