import type { Geometry } from "geojson";
import { ValidationError } from "../../common/errors/app-error";
import { assertWgs84Crs } from "../data-sources/imports/readers/geojson-reader";
import { facilityTypeOf, isWaterClass, roadClassRank } from "./layer-rules";
import type { InfrastructureRow, PreparedRows, RejectCounts, RoadRow, SettlementRow, WaterwayRow } from "./map-layer-loader.types";

/** One GeoJSON feature, reduced to what the loader needs. */
export interface LayerFeature {
  properties: Record<string, unknown>;
  geometry: Geometry | null;
}

/**
 * Reads a GeoJSON FeatureCollection of any size. Unlike the import pipeline's reader there is no
 * row cap: the roads file has 47,507 features, which is why it can't go through the 20,000-row
 * upload screen. A file that declares a CRS other than WGS84 is refused (rule 7).
 */
export function parseLayerGeoJson(buffer: Buffer, fileName: string): LayerFeature[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer.toString("utf8").replace(/^﻿/, ""));
  } catch {
    throw fileError(fileName, "is not valid JSON");
  }
  const root = parsed as { type?: unknown; features?: unknown; crs?: { properties?: { name?: unknown } } } | null;
  if (!root || root.type !== "FeatureCollection" || !Array.isArray(root.features)) {
    throw fileError(fileName, 'is not a GeoJSON FeatureCollection (type: "FeatureCollection")');
  }
  assertWgs84Crs(root.crs?.properties?.name);

  return (root.features as unknown[]).map((feature) => {
    const candidate = (feature ?? {}) as { properties?: unknown; geometry?: unknown };
    return {
      properties: isRecord(candidate.properties) ? candidate.properties : {},
      geometry: isGeometry(candidate.geometry) ? candidate.geometry : null,
    };
  });
}

function fileError(fileName: string, problem: string): ValidationError {
  return new ValidationError([{ field: fileName, message: `${fileName} ${problem}.` }]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGeometry(value: unknown): value is Geometry {
  return isRecord(value) && typeof value.type === "string" && "coordinates" in value;
}

/**
 * A property as trimmed text, or null when it is missing or blank. GRID3 marks "no value" with a
 * single space, so a blank is never data.
 */
export function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") return null;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : trimmed;
}

const TOO_LONG = "a text value is too long for its column";

/** Each field's length is checked rather than cut: a value from a source is never silently altered. */
function fitsColumns(...fields: [value: string | null, max: number][]): boolean {
  return fields.every(([value, max]) => value === null || value.length <= max);
}

type Built<T> = { row: T; key: string } | { reject: string };

function prepare<T>(features: LayerFeature[], build: (feature: LayerFeature) => Built<T>): PreparedRows<T> {
  const rows: T[] = [];
  const rejected: RejectCounts = {};
  const seen = new Set<string>();
  const reject = (reason: string) => {
    rejected[reason] = (rejected[reason] ?? 0) + 1;
  };

  for (const feature of features) {
    const built = build(feature);
    if ("reject" in built) {
      reject(built.reject);
    } else if (seen.has(built.key)) {
      // The database would keep the first and skip the rest; saying so here keeps the counts honest.
      reject("the same id appears more than once in the file");
    } else {
      seen.add(built.key);
      rows.push(built.row);
    }
  }
  return { rows, rejected };
}

export function prepareRoads(features: LayerFeature[]): PreparedRows<RoadRow> {
  return prepare<RoadRow>(features, ({ properties: p, geometry }) => {
    const osmId = text(p.osm_id);
    const roadClass = text(p.road_type);
    if (!osmId) return { reject: "no osm_id" };
    if (!roadClass) return { reject: "no road type" };
    if (!geometry) return { reject: "no shape" };

    const row: RoadRow = {
      osmId,
      name: text(p.name),
      roadClass,
      classRank: roadClassRank(roadClass),
      surface: text(p.surface),
      smoothness: text(p.smoothness),
      width: text(p.width),
      lanes: text(p.lanes),
      oneway: text(p.oneway),
      isBridge: text(p.bridge)?.toLowerCase() === "yes",
      shape: JSON.stringify(geometry),
    };
    const fits = fitsColumns(
      [row.osmId, 40], [row.name, 200], [row.roadClass, 40], [row.surface, 40],
      [row.smoothness, 40], [row.width, 40], [row.lanes, 40], [row.oneway, 40],
    );
    return fits ? { row, key: osmId } : { reject: TOO_LONG };
  });
}

export function prepareWaterways(features: LayerFeature[]): PreparedRows<WaterwayRow> {
  return prepare<WaterwayRow>(features, ({ properties: p, geometry }) => {
    const osmId = text(p.osm_id);
    const waterClass = text(p.water_class);
    const classBasis = text(p.class_basis);
    if (!osmId) return { reject: "no osm_id" };
    if (!waterClass || !isWaterClass(waterClass)) return { reject: "water_class is not river, creek or other" };
    if (!classBasis) return { reject: "no class_basis" };
    if (!geometry) return { reject: "no shape" };

    const row: WaterwayRow = {
      osmId,
      name: text(p.name),
      waterwayType: text(p.waterway_type),
      waterTag: text(p.water_tag),
      waterClass,
      classBasis,
      tunnel: text(p.tunnel),
      covered: text(p.covered),
      width: text(p.width),
      shape: JSON.stringify(geometry),
    };
    const fits = fitsColumns(
      [row.osmId, 40], [row.name, 200], [row.waterwayType, 40], [row.waterTag, 40],
      [row.classBasis, 20], [row.tunnel, 40], [row.covered, 40], [row.width, 40],
    );
    return fits ? { row, key: osmId } : { reject: TOO_LONG };
  });
}

export function prepareSettlements(features: LayerFeature[]): PreparedRows<SettlementRow> {
  return prepare<SettlementRow>(features, ({ properties: p, geometry }) => {
    const setId = text(p.set_id);
    const name = text(p.set_name);
    const wardCode = text(p.wardcode);
    if (!setId) return { reject: "no set_id" };
    if (!name) return { reject: "no settlement name" };
    if (!wardCode) return { reject: "no ward code" };
    if (!geometry) return { reject: "no shape" };

    const row: SettlementRow = {
      setId,
      wardCode,
      name,
      isPrimary: text(p.is_primary)?.toLowerCase() === "yes",
      dataOrigin: text(p.source),
      shape: JSON.stringify(geometry),
    };
    const fits = fitsColumns([row.setId, 50], [row.name, 200], [row.wardCode, 100], [row.dataOrigin, 100]);
    return fits ? { row, key: setId } : { reject: TOO_LONG };
  });
}

export const NOT_A_FACILITY = "not a facility type the layer keeps (shops, kiosks, sports pitches, hotels...)";

/**
 * Facilities from Geofabrik's pois, pofw and transport GeoPackages. Only the classes in
 * layer-rules.ts are kept; the rest are counted under one reason, so the report shows how much
 * was left out on purpose. An outline (a hospital mapped as its grounds) is stored as a point
 * inside it, flagged `fromArea`.
 */
export function prepareInfrastructure(features: LayerFeature[]): PreparedRows<InfrastructureRow> {
  return prepare<InfrastructureRow>(features, ({ properties: p, geometry }) => {
    const osmId = text(p.osm_id);
    const osmClass = text(p.fclass);
    if (!osmId) return { reject: "no osm_id" };
    if (!osmClass) return { reject: "no fclass" };
    const facilityType = facilityTypeOf(osmClass);
    if (!facilityType) return { reject: NOT_A_FACILITY };
    if (!geometry) return { reject: "no shape" };

    const fromArea = geometry.type === "Polygon" || geometry.type === "MultiPolygon";
    const row: InfrastructureRow = {
      osmId,
      fromArea,
      name: text(p.name),
      facilityType,
      osmClass,
      shape: JSON.stringify(geometry),
    };
    const fits = fitsColumns([row.osmId, 40], [row.name, 200], [row.osmClass, 40]);
    // OSM numbers nodes and ways separately, so a point and an outline may share a number.
    return fits ? { row, key: `${fromArea ? "area" : "point"}:${osmId}` } : { reject: TOO_LONG };
  });
}
