import { unzipSync } from "fflate";
import { ValidationError } from "../../common/errors/app-error";
import { MAX_UNZIPPED_BYTES } from "../data-sources/imports/readers/reader-limits";
import { isGeoPackage } from "./gpkg-reader";

/**
 * Geofabrik's OpenStreetMap extract, as the data team delivers it: a folder of GeoPackages named
 * gis_osm_<layer>_free_<n>[_<area>].gpkg, zipped. The infrastructure layer reads the facility
 * files only: points of interest, places of worship and transport (each as points, and as areas
 * with an `_a` suffix). The rest (buildings, roads, land use...) are left packed, so a 60 MB
 * delivery unpacks to about a megabyte here.
 */
const FACILITY_FILE = /^gis_osm_(pois|pofw|transport)(_a)?_free_\d+.*\.gpkg$/i;

export interface OsmFile {
  fileName: string;
  buffer: Buffer;
}

export function isFacilityFile(fileName: string): boolean {
  return FACILITY_FILE.test(baseName(fileName));
}

/**
 * The facility GeoPackages in an upload: every matching file of a zip, or the file itself when
 * a single .gpkg is given. Sorted by name, so the report reads the same on every run.
 */
export function facilityFiles(buffer: Buffer, fileName: string): OsmFile[] {
  if (isGeoPackage(buffer)) return [{ fileName: baseName(fileName), buffer }];
  if (buffer.subarray(0, 2).toString("latin1") !== "PK") {
    throw new ValidationError([
      { field: fileName, message: `${fileName} is neither a GeoPackage (.gpkg) nor a zip of Geofabrik GeoPackages.` },
    ]);
  }

  let unpacked: Record<string, Uint8Array>;
  try {
    let claimed = 0;
    unpacked = unzipSync(buffer, {
      filter: (entry) => {
        const keep = isFacilityFile(entry.name);
        if (keep) {
          claimed += entry.originalSize;
          // Guards against a zip bomb: stop before unpacking, whatever sizes the zip claims.
          if (claimed > MAX_UNZIPPED_BYTES) throw new Error("too large");
        }
        return keep;
      },
    });
  } catch {
    throw new ValidationError([
      { field: fileName, message: `${fileName} could not be opened, or its facility files unpack to more than ${MAX_UNZIPPED_BYTES / (1024 * 1024)} MB.` },
    ]);
  }

  const files = Object.entries(unpacked)
    .map(([name, bytes]) => ({ fileName: baseName(name), buffer: Buffer.from(bytes) }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
  if (files.length === 0) {
    throw new ValidationError([
      {
        field: fileName,
        message: `${fileName} has no OpenStreetMap facility files (gis_osm_pois, gis_osm_pofw or gis_osm_transport .gpkg files, as Geofabrik names them).`,
      },
    ]);
  }
  return files;
}

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}
