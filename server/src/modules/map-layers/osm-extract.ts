import { unzipSync } from "fflate";
import { ValidationError } from "../../common/errors/app-error";
import { MAX_UNZIPPED_BYTES } from "../data-sources/imports/readers/reader-limits";
import { isGeoPackage } from "./gpkg-reader";

/**
 * Geofabrik's OpenStreetMap extract, as the data team delivers it: a folder of GeoPackages named
 * gis_osm_<layer>_free_<n>[_<area>].gpkg, zipped. Each loader reads only the files it needs and
 * leaves the rest packed:
 *  - infrastructure: points of interest, places of worship and transport, each as points and as
 *    areas (an `_a` suffix), about a megabyte in all;
 *  - buildings: the building outlines, which Geofabrik splits into numbered parts (_1, _2...)
 *    once a file would pass 2 GB as a shapefile.
 */
const OSM_FILES = {
  infrastructure: {
    pattern: /^gis_osm_(pois|pofw|transport)(_a)?_free_\d+.*\.gpkg$/i,
    description: "facility files (gis_osm_pois, gis_osm_pofw or gis_osm_transport .gpkg files, as Geofabrik names them)",
  },
  buildings: {
    pattern: /^gis_osm_buildings_a_free_\d+.*\.gpkg$/i,
    description: "building files (gis_osm_buildings_a_free_<n> .gpkg files, as Geofabrik names them)",
  },
} as const;
export type OsmLayer = keyof typeof OSM_FILES;

export interface OsmFile {
  fileName: string;
  /**
   * The file's bytes, unpacked on each call and not kept: buildings are read twice (checked,
   * then loaded) one file at a time, so only one ~60 MB file is unpacked at once.
   */
  read(): Buffer;
}

export function isOsmFile(layer: OsmLayer, fileName: string): boolean {
  return OSM_FILES[layer].pattern.test(baseName(fileName));
}

/**
 * The GeoPackages one layer needs from an upload: every matching file of a zip, or the file
 * itself when a single .gpkg is given. Sorted by name, so the report reads the same on every run.
 * Nothing is unpacked until a file's `read()` is called.
 */
export function osmFiles(layer: OsmLayer, buffer: Buffer, fileName: string): OsmFile[] {
  if (isGeoPackage(buffer)) return [{ fileName: baseName(fileName), read: () => buffer }];
  if (buffer.subarray(0, 2).toString("latin1") !== "PK") {
    throw new ValidationError([
      { field: fileName, message: `${fileName} is neither a GeoPackage (.gpkg) nor a zip of Geofabrik GeoPackages.` },
    ]);
  }

  // List the matching entries from the zip's directory; the filter refuses them all, so nothing is unpacked yet.
  const entries: string[] = [];
  let claimed = 0;
  try {
    unzipSync(buffer, {
      filter: (entry) => {
        if (isOsmFile(layer, entry.name)) {
          entries.push(entry.name);
          claimed += entry.originalSize;
        }
        return false;
      },
    });
  } catch {
    throw new ValidationError([{ field: fileName, message: `${fileName} could not be opened as a zip.` }]);
  }
  // Guards against a zip bomb: refused before unpacking, whatever sizes the zip claims.
  if (claimed > MAX_UNZIPPED_BYTES) {
    throw new ValidationError([
      {
        field: fileName,
        message: `${fileName}'s ${layer} files unpack to more than ${MAX_UNZIPPED_BYTES / (1024 * 1024)} MB (IMPORT_MAX_UNZIPPED_MB).`,
      },
    ]);
  }
  if (entries.length === 0) {
    throw new ValidationError([{ field: fileName, message: `${fileName} has no OpenStreetMap ${OSM_FILES[layer].description}.` }]);
  }

  return entries
    .map((entryName) => ({
      fileName: baseName(entryName),
      read: () => {
        const unpacked = unzipSync(buffer, { filter: (entry) => entry.name === entryName })[entryName];
        if (!unpacked) throw new ValidationError([{ field: fileName, message: `${fileName} could not unpack ${entryName}.` }]);
        return Buffer.from(unpacked.buffer, unpacked.byteOffset, unpacked.byteLength);
      },
    }))
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
}

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}
