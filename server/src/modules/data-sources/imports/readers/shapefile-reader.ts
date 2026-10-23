import type { ParsedFile, ParsedRow } from "../import.types";
import { parseDbf, type DbfTable } from "./dbf-parser";
import { fileError } from "./file-error";
import { parseShp, type Extent } from "./shp-parser";

/** The files that make up one shapefile. Only the .shp is required. */
export interface ShapefileParts {
  shp: Buffer;
  /** Attribute table: the names, codes and other columns of each shape. */
  dbf?: Buffer;
  /** Coordinate system, as ESRI well-known text. */
  prj?: Buffer;
  /** Character encoding of the .dbf's text. */
  cpg?: Buffer;
}

/**
 * Reads a shapefile into the same shape as every other file: one row per record, the .dbf
 * columns as headings, the record's shape as GeoJSON. Nothing is invented. A shapefile with no
 * .dbf has shapes but no names, and says so; a coordinate system other than WGS84 is refused
 * (section 13, rule 7: never store a shape in an unknown or unstated CRS); and a missing .prj
 * is only accepted when every coordinate is a valid longitude/latitude, with a warning.
 */
export function readShapefile(parts: ShapefileParts): ParsedFile {
  const shapes = parseShp(parts.shp);
  const warnings: string[] = [];

  checkCoordinateSystem(parts.prj ? describeCrs(parts.prj.toString("utf8")) : { kind: "unstated" }, shapes.extent, warnings);

  const table: DbfTable | null = parts.dbf ? parseDbf(parts.dbf, parts.cpg ? parts.cpg.toString("utf8") : null) : null;
  if (table && table.rows.length !== shapes.geometries.length) {
    throw fileError(
      `The .dbf has ${table.rows.length} records but the .shp has ${shapes.geometries.length} shapes, so they aren't from the same shapefile. ` +
        "Upload the .shp, .dbf and .prj that were saved together.",
    );
  }
  if (!table) {
    warnings.push(
      "No .dbf attribute table came with the shapefile, so its shapes have no names or codes. " +
        "Upload a .zip that holds the .shp together with its .dbf (and .prj).",
    );
  } else if (table.skipped.length > 0) {
    warnings.push(`These attribute columns were left out because their type can't be read: ${table.skipped.join(", ")}.`);
  }
  if (shapes.closedRings > 0) {
    warnings.push(`${shapes.closedRings} polygon rings in the .shp weren't closed (their last point differs from their first), so they were closed.`);
  }

  let deleted = 0;
  const rows: ParsedRow[] = [];
  shapes.geometries.forEach((geometry, index) => {
    const values = table ? table.rows[index] : {};
    if (values === null) {
      deleted++; // flagged as deleted in the .dbf: the feature is gone
      return;
    }
    rows.push({ rowNumber: index + 1, values: values ?? {}, geometry: geometry ? JSON.stringify(geometry) : null });
  });
  if (deleted > 0) warnings.push(`${deleted} records flagged as deleted in the .dbf were left out.`);

  return { fileType: "shapefile", sheets: [], sheetName: null, headerRow: null, headings: table?.headings ?? [], rows, warnings };
}

type Crs = { kind: "wgs84" } | { kind: "other"; name: string } | { kind: "unstated" };

/** Works out the coordinate system from the text of a .prj file (ESRI or OGC well-known text). */
export function describeCrs(prj: string): Crs {
  const text = prj.replace(/^﻿/, "").trim();
  const name = /^\s*\w+\s*\[\s*"([^"]*)"/.exec(text)?.[1]?.trim() ?? "";
  const projected = /^\s*(PROJCS|PROJCRS|PROJECTEDCRS)\b/i.test(text);
  const geographic = /^\s*(GEOGCS|GEOGCRS|GEODCRS|GEODETICCRS)\b/i.test(text);
  if (!projected && !geographic) return { kind: "unstated" };
  if (projected) return { kind: "other", name: name || "a projected coordinate system" };

  // The CRS's own EPSG code is the only 4326 a GEOGCS can contain (its datum, spheroid and
  // units carry other codes), so finding it, or WGS 84 in the name, is enough.
  const isWgs84 = /(?:AUTHORITY|ID)\s*\[\s*"EPSG"\s*,\s*"?4326"?\s*\]/i.test(text) || /wgs[\s_]*(?:19)?84/i.test(name);
  if (isWgs84) return { kind: "wgs84" };
  if (!name || /unknown|undefined|unnamed/i.test(name)) return { kind: "unstated" };
  return { kind: "other", name };
}

function checkCoordinateSystem(crs: Crs, extent: Extent | null, warnings: string[]): void {
  if (crs.kind === "other") {
    throw fileError(
      `The shapefile's coordinate system is ${crs.name}. Only EPSG:4326 (WGS84) is accepted: re-project it first ` +
        "(in QGIS: Export > Save Features As..., CRS EPSG:4326), then upload it again.",
    );
  }
  if (!extent) return; // no shapes at all; nothing to check

  const [minX, minY, maxX, maxY] = extent;
  const isLonLat = minX >= -180 && maxX <= 180 && minY >= -90 && maxY <= 90;
  if (!isLonLat) {
    throw fileError(
      crs.kind === "wgs84"
        ? "The shapefile says it is in WGS84, but its coordinates aren't valid longitudes and latitudes (-180 to 180, -90 to 90). The file is inconsistent: check it in GIS software."
        : "The shapefile's coordinates aren't longitudes and latitudes (they look like projected metres), and it has no .prj file to say which coordinate system they use. " +
            "Re-project it to EPSG:4326, or upload a .zip that includes its .prj.",
    );
  }
  if (crs.kind === "unstated") {
    warnings.push(
      "No coordinate system (.prj) came with the shapefile. Its shapes are assumed to be WGS84 longitude/latitude because every coordinate " +
        "is a valid longitude and latitude. Check the shapes on the review map before promoting.",
    );
  }
}
