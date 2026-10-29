import { unzipSync } from "fflate";
import { ValidationError } from "../../common/errors/app-error";
import { MAX_GEOPACKAGE_BYTES } from "../data-sources/imports/readers/reader-limits";
import { isGeoPackage } from "./gpkg-reader";

/**
 * Geofabrik's OpenStreetMap extract, as the data team delivers it: a zipped folder of GeoPackages,
 * one per theme. Two namings have arrived, and both are read:
 *  - Geofabrik's own: gis_osm_<theme>[_a]_free_<n>[_<area>].gpkg (buildings split into parts _1, _2...);
 *  - the team's clipped handover: <area>_<theme>[_a].gpkg, e.g. rivers_pois.gpkg, rivers_buildings_a.gpkg.
 * The theme is a whole word between underscores, so "pois" never matches inside another name.
 * Each loader reads only the files it needs and leaves the rest packed:
 *  - infrastructure: points of interest, places of worship and transport, each as points and as
 *    areas (an `_a` suffix), about a megabyte in all;
 *  - buildings: the building outlines, in one file or several parts.
 */
const OSM_FILES = {
  infrastructure: {
    pattern: /(?:^|_)(?:pois|pofw|transport)(?:_a)?(?:_[^.]*)?\.gpkg$/i,
    description: "facility files (pois, pofw or transport .gpkg files, e.g. rivers_pois.gpkg or gis_osm_pois_free_1.gpkg)",
  },
  buildings: {
    pattern: /(?:^|_)buildings(?:_a)?(?:_[^.]*)?\.gpkg$/i,
    description: "building files (buildings .gpkg files, e.g. rivers_buildings_a.gpkg or gis_osm_buildings_a_free_1.gpkg)",
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
export function osmFiles(layer: OsmLayer, buffer: Buffer, fileName: string, maxFileBytes = MAX_GEOPACKAGE_BYTES): OsmFile[] {
  if (isGeoPackage(buffer)) return [{ fileName: baseName(fileName), read: () => buffer }];
  if (buffer.subarray(0, 2).toString("latin1") !== "PK") {
    throw new ValidationError([
      { field: fileName, message: `${fileName} is neither a GeoPackage (.gpkg) nor a zip of Geofabrik GeoPackages.` },
    ]);
  }

  // List the matching entries from the zip's directory; the filter refuses them all, so nothing is unpacked yet.
  const entries: string[] = [];
  const tooLarge: string[] = [];
  try {
    unzipSync(buffer, {
      filter: (entry) => {
        if (isOsmFile(layer, entry.name)) {
          entries.push(entry.name);
          if (entry.originalSize > maxFileBytes) tooLarge.push(`${baseName(entry.name)} (${mb(entry.originalSize)} MB)`);
        }
        return false;
      },
    });
  } catch {
    throw new ValidationError([{ field: fileName, message: `${fileName} could not be opened as a zip.` }]);
  }
  // Guards against a zip bomb, before anything is unpacked. Files are unpacked one at a time and
  // dropped after, so the limit applies to each file, not to their total.
  if (tooLarge.length > 0) {
    throw new ValidationError([
      {
        field: fileName,
        message: `${tooLarge.join(", ")} would unpack to more than the ${mb(maxFileBytes)} MB allowed for one GeoPackage (IMPORT_MAX_GPKG_MB on the server).`,
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

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(0);
}

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}
