import { ValidationError } from "../../../../common/errors/app-error";
import type { ParsedFile, ParsedRow } from "../import.types";
import { MAX_IMPORT_ROWS } from "./reader-limits";

/** CRS names that all mean WGS84 longitude/latitude (EPSG:4326 axis order as GeoJSON uses it). */
const WGS84_NAMES = new Set([
  "urn:ogc:def:crs:ogc:1.3:crs84",
  "urn:ogc:def:crs:epsg::4326",
  "epsg:4326",
  "crs84",
]);

interface FeatureLike {
  type?: unknown;
  properties?: unknown;
  geometry?: unknown;
}

/**
 * Reads a GeoJSON FeatureCollection (or a single Feature). Each feature becomes one row: its
 * properties are the columns and its geometry is the shape. A file that declares any CRS
 * other than WGS84 is refused, because the platform never stores a shape in an unknown or
 * unstated CRS (section 13, rule 7). Re-project such a file before importing it.
 */
export function readGeoJson(buffer: Buffer): ParsedFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer.toString("utf8").replace(/^﻿/, ""));
  } catch {
    throw fileError("The file is not valid JSON, so it can't be read as GeoJSON.");
  }

  const root = parsed as { type?: unknown; features?: unknown; crs?: { properties?: { name?: unknown } } } | null;
  const isCollection = root?.type === "FeatureCollection" && Array.isArray(root.features);
  if (!root || (!isCollection && root.type !== "Feature")) {
    throw fileError('A GeoJSON import must be a FeatureCollection (type: "FeatureCollection").');
  }
  const features: FeatureLike[] = isCollection ? (root.features as FeatureLike[]) : [root as FeatureLike];

  const crsName = root.crs?.properties?.name;
  if (typeof crsName === "string" && !WGS84_NAMES.has(crsName.toLowerCase())) {
    throw fileError(`The file's CRS is ${crsName}. Only EPSG:4326 (WGS84) is accepted: re-project the file first.`);
  }
  if (features.length > MAX_IMPORT_ROWS) {
    throw fileError(`The file has more than ${MAX_IMPORT_ROWS} features; split it into smaller files.`);
  }

  const headings: string[] = [];
  const seen = new Set<string>();
  const rows: ParsedRow[] = features.map((feature, index) => {
    const properties = isRecord(feature?.properties) ? feature.properties : {};
    const values: Record<string, string | null> = {};
    for (const [key, value] of Object.entries(properties)) {
      if (!seen.has(key)) {
        seen.add(key);
        headings.push(key);
      }
      values[key] = toText(value);
    }
    return {
      rowNumber: index + 1,
      values,
      geometry: isRecord(feature?.geometry) ? JSON.stringify(feature.geometry) : null,
    };
  });

  return { fileType: "geojson", sheets: [], sheetName: null, headerRow: null, headings, rows };
}

function toText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return text.trim() || null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fileError(message: string): ValidationError {
  return new ValidationError([{ field: "file", message }]);
}
