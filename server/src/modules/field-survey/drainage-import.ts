import { createHash } from "node:crypto";
import type { LonLat } from "../../common/geo/geo";
import { parseLayerGeoJson, text } from "../map-layers/map-layer-rows";
import type { ImportedDrain } from "./field-survey.types";
import {
  DRAIN_MATERIALS,
  DRAINAGE_CONDITIONS,
  FLOW_DIRECTIONS,
  SURVEY_LIMITS,
  distinctPoints,
  isLineKind,
  type DrainageCondition,
  type DrainageKind,
  type DrainMaterial,
  type FlowDirection,
} from "./survey-rules";

/**
 * Reading a drainage plan: a GeoJSON FeatureCollection of drains (lines) and culverts, outfalls, inlets
 * and ponds (points), from a ministry's or a consultant's survey. Column names vary between plans, so
 * each field is looked for under the names such files use, and kinds are matched by their usual words.
 *
 *   kind       kind | type | drain_type | feature   (open drain, covered drain, culvert, outfall, inlet, gully, pond...)
 *   condition  condition | status                  (one of the five conditions; blank means not checked on the ground)
 *   name       name | label
 *   width_m, depth_m, diameter_m   width | width_m, depth | depth_m, diameter | diameter_m | dia
 *   material   material                            (concrete, masonry, plastic, metal, earth, other)
 *   barrels    barrels | cells | pipes
 *   flow       flow | flow_direction               (with_line | against_line)
 *   checked    checked | last_checked | survey_date (YYYY-MM-DD: when it was last seen, or the plan's date)
 *   ref        ref | id | fid | asset_id (else a hash of what it is and where it is)
 *
 * A line with no kind is an open drain; a point with no kind is refused (it could be anything).
 */

export interface ParsedPlan {
  featuresInFile: number;
  drains: ImportedDrain[];
  rejected: Record<string, number>;
}

const KIND_WORDS: readonly [RegExp, DrainageKind][] = [
  [/covered|closed|box|piped|underground/, "covered_drain"],
  [/culvert|pipe crossing/, "culvert"],
  [/outfall|outlet|discharge/, "outfall"],
  [/inlet|gully|gulley|catch ?basin|grate|manhole/, "inlet"],
  [/pond|basin|retention|detention|reservoir/, "retention_pond"],
  [/drain|ditch|channel|canal|gutter|open/, "open_drain"],
];

function kindOf(value: string | null, line: boolean): DrainageKind | null {
  if (!value) return line ? "open_drain" : null;
  const words = value.toLowerCase().replace(/[_-]+/g, " ");
  if (/^(open drain|covered drain|culvert|outfall|inlet|retention pond)$/.test(words)) return words.replace(" ", "_") as DrainageKind;
  for (const [pattern, kind] of KIND_WORDS) {
    // A covered drain is still a drain: only lines may be drains, only points spots.
    if (pattern.test(words) && isLineKind(kind) === line) return kind;
  }
  return null;
}

const pick = (p: Record<string, unknown>, ...names: string[]): unknown => {
  for (const name of names) {
    const key = Object.keys(p).find((k) => k.toLowerCase() === name);
    if (key !== undefined && p[key] !== null && p[key] !== "") return p[key];
  }
  return undefined;
};

function metres(value: unknown, max: number): number | null | "bad" {
  if (value === undefined) return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/\s*m$/i, ""));
  return Number.isFinite(n) && n > 0 && n <= max ? n : "bad";
}

function oneOf<T extends string>(list: readonly T[], value: unknown): T | null | "bad" {
  if (value === undefined) return null;
  const word = String(value).trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (list as readonly string[]).includes(word) ? (word as T) : "bad";
}

function validPoint(value: unknown): value is LonLat {
  return (
    Array.isArray(value) &&
    typeof value[0] === "number" && typeof value[1] === "number" &&
    value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90
  );
}

/** Reads and checks a plan. Nothing is stored here; the repository builds and places each shape in PostGIS. */
export function parseDrainagePlan(buffer: Buffer, fileName: string, planDate: string): ParsedPlan {
  const features = parseLayerGeoJson(buffer, fileName);
  const rejected: Record<string, number> = {};
  const reject = (reason: string) => {
    rejected[reason] = (rejected[reason] ?? 0) + 1;
  };
  const drains: ImportedDrain[] = [];
  const seen = new Set<string>();

  if (features.length > SURVEY_LIMITS.importMaxFeatures) {
    return { featuresInFile: features.length, drains: [], rejected: { [`more than ${SURVEY_LIMITS.importMaxFeatures.toLocaleString("en")} features: split the file`]: features.length } };
  }

  for (const feature of features) {
    const p = feature.properties;
    const geometry = feature.geometry;
    if (!geometry) {
      reject("no shape");
      continue;
    }
    let points: LonLat[];
    if (geometry.type === "LineString") points = geometry.coordinates.map((c) => [c[0]!, c[1]!] as LonLat);
    else if (geometry.type === "Point") points = [[geometry.coordinates[0]!, geometry.coordinates[1]!]];
    else {
      reject(geometry.type === "MultiLineString" ? "a multi-part line: split it into single lines" : `a ${geometry.type}, not a line or a point`);
      continue;
    }
    if (!points.every(validPoint)) {
      reject("coordinates that aren't longitude and latitude");
      continue;
    }
    const line = geometry.type === "LineString";
    if (line && distinctPoints(points) < 2) {
      reject("a line with fewer than two different points");
      continue;
    }
    if (points.length > SURVEY_LIMITS.maxPoints) {
      reject(`a line with more than ${SURVEY_LIMITS.maxPoints} points`);
      continue;
    }

    const kind = kindOf(text(pick(p, "kind", "type", "drain_type", "feature", "class")), line);
    if (!kind) {
      reject(line ? "a kind that isn't a drain" : "a point with no kind we recognise (culvert, outfall, inlet, pond)");
      continue;
    }
    const conditionValue = oneOf<DrainageCondition>(DRAINAGE_CONDITIONS, pick(p, "condition", "status"));
    const material = oneOf<DrainMaterial>(DRAIN_MATERIALS, pick(p, "material"));
    const flow = oneOf<FlowDirection>(FLOW_DIRECTIONS, pick(p, "flow", "flow_direction"));
    const widthM = metres(pick(p, "width_m", "width"), SURVEY_LIMITS.maxDrainSizeM);
    const depthM = metres(pick(p, "depth_m", "depth"), SURVEY_LIMITS.maxDrainSizeM);
    const diameterM = metres(pick(p, "diameter_m", "diameter", "dia"), SURVEY_LIMITS.maxDiameterM);
    const barrelsRaw = pick(p, "barrels", "cells", "pipes");
    const barrels = barrelsRaw === undefined ? null : Number(barrelsRaw);
    if ([conditionValue, material, flow, widthM, depthM, diameterM].includes("bad")) {
      reject("a condition, material, flow or size the platform doesn't recognise");
      continue;
    }
    if (barrels !== null && !(Number.isInteger(barrels) && barrels >= 1 && barrels <= SURVEY_LIMITS.maxBarrels)) {
      reject("a number of pipes that isn't a whole number from 1 to 20");
      continue;
    }
    const checked = text(pick(p, "checked", "last_checked", "survey_date", "date"));
    const checkedAt = checked && /^\d{4}-\d{2}-\d{2}/.test(checked) && Number.isFinite(Date.parse(checked)) ? checked.slice(0, 10) : planDate;

    const name = text(pick(p, "name", "label"));
    const ownRef = text(pick(p, "ref", "id", "fid", "asset_id"));
    const sourceRef = (ownRef ? `ref:${ownRef}` : `hash:${createHash("sha1").update(JSON.stringify([kind, points])).digest("hex")}`).slice(0, 100);
    if (seen.has(sourceRef)) {
      reject("the same id twice in the file");
      continue;
    }
    seen.add(sourceRef);
    if ((name?.length ?? 0) > SURVEY_LIMITS.nameLength) {
      reject("a name longer than 120 characters");
      continue;
    }

    drains.push({
      sourceRef,
      kind,
      // A plan rarely says what shape a drain is in now. Stored as clear but dated when the plan was made, so
      // the map draws it faded ("not checked in 90 days") until someone looks, and the note says so.
      condition: (conditionValue as DrainageCondition | null) ?? "clear",
      name,
      widthM: widthM as number | null,
      depthM: depthM as number | null,
      diameterM: diameterM as number | null,
      material: material as DrainMaterial | null,
      barrels,
      flowDirection: line ? (flow as FlowDirection | null) : null,
      note: conditionValue ? null : "From a drainage plan: its condition hasn't been checked on the ground yet.",
      points,
      checkedAt,
    });
  }
  return { featuresInFile: features.length, drains, rejected };
}
