import type { AdminUnitLookupRow } from "../../admin-units/admin-unit.types";
import { findNameStandard, matchKey, standardName } from "../../admin-units/name-standards";
import type { AdminUnitStagedFields, ColumnMapping, ParsedFile, StagedRowInput } from "./import.types";

export interface AdminUnitRowContext {
  countryCode: string;
  level: number;
  levelName: string;
  /** The parent level's name ("State" when importing LGAs), for messages. */
  parentLevelName: string | null;
  /** Set when the admin chose one parent for every row. */
  fixedParent: AdminUnitLookupRow | null;
  /** Live areas one level up: the candidates a row's parent_code can match. */
  parents: AdminUnitLookupRow[];
  /** Live areas already at this level, so a re-import is caught as a duplicate. */
  existing: AdminUnitLookupRow[];
}

const MAX_NAME = 200;
const MAX_CODE = 100;

/**
 * The checks that need no PostGIS: name present, code length, parent found, name on the
 * standard list (with known spellings mapped to it), and duplicates within the file or
 * against the live table. Shape checks run afterwards in the database (ImportRepository).
 * A row is never dropped or silently fixed: every problem becomes an error, and every change
 * (a standardised name) becomes a warning the admin sees before promoting.
 */
export function prepareAdminUnitRows(file: ParsedFile, mapping: ColumnMapping, ctx: AdminUnitRowContext): StagedRowInput[] {
  const parentByCode = new Map<string, AdminUnitLookupRow>();
  const parentsByKey = new Map<string, AdminUnitLookupRow[]>();
  for (const parent of ctx.parents) {
    if (parent.unitCode) parentByCode.set(parent.unitCode.toLowerCase(), parent);
    const key = matchKey(parent.unitName, ctx.countryCode);
    parentsByKey.set(key, [...(parentsByKey.get(key) ?? []), parent]);
  }

  const liveNames = new Set(ctx.existing.map((u) => `${u.parentId ?? ""}|${matchKey(u.unitName, ctx.countryCode)}`));
  const liveCodes = new Set(ctx.existing.filter((u) => u.unitCode).map((u) => u.unitCode!.toLowerCase()));
  const fileNames = new Map<string, number>();
  const fileCodes = new Map<string, number>();

  return file.rows.map((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const raw = { ...row.values };
    const cell = (column: keyof ColumnMapping) => {
      const heading = mapping[column];
      return heading ? (row.values[heading]?.trim() ?? null) || null : null;
    };

    // The shape: a GeoJSON feature's geometry, or the mapped text column (WKT, or GeoJSON text).
    let geomSource = row.geometry;
    let geomFormat: StagedRowInput["geomFormat"] = row.geometry ? "geojson" : null;
    if (file.fileType === "xlsx" && mapping.geometry_wkt) {
      geomSource = cell("geometry_wkt");
      geomFormat = geomSource ? (geomSource.startsWith("{") ? "geojson" : "wkt") : null;
      delete raw[mapping.geometry_wkt];
    }

    let unitName = cell("unit_name");
    const unitCode = cell("unit_code");
    if (!unitName) errors.push("The name is missing");
    else if (unitName.length > MAX_NAME) errors.push(`The name is longer than ${MAX_NAME} characters`);
    if (unitCode && unitCode.length > MAX_CODE) errors.push(`The code is longer than ${MAX_CODE} characters`);

    // The parent: none at level 1, the admin's fixed choice, or matched by code then by name.
    let parent: AdminUnitLookupRow | null = null;
    const parentRef = ctx.level > 1 && !ctx.fixedParent ? cell("parent_code") : null;
    if (ctx.level > 1) {
      if (ctx.fixedParent) parent = ctx.fixedParent;
      else if (!parentRef) errors.push(`The parent ${ctx.parentLevelName ?? "area"} is missing`);
      else {
        const byCode = parentByCode.get(parentRef.toLowerCase());
        const byName = parentsByKey.get(matchKey(parentRef, ctx.countryCode)) ?? [];
        if (byCode) parent = byCode;
        else if (byName.length === 1) parent = byName[0]!;
        else if (byName.length > 1) errors.push(`"${parentRef}" matches more than one ${ctx.parentLevelName}; use its code instead`);
        else errors.push(`No ${ctx.parentLevelName ?? "parent area"} called or coded "${parentRef}" exists yet`);
      }
    }

    // Standard names: only where a list exists for this level under this parent.
    const standard = findNameStandard(ctx.countryCode, ctx.level, parent?.unitName ?? null);
    if (standard && unitName) {
      const standardised = standardName(unitName, standard);
      if (!standardised) errors.push(`"${unitName}" is not one of ${standard.label}`);
      else if (standardised !== unitName) {
        warnings.push(`Name standardised from "${unitName}" to "${standardised}"`);
        unitName = standardised;
      }
    }

    // Duplicates: same parent + same name, or same code, in this file or already live.
    if (unitName) {
      const key = `${parent?.id ?? ""}|${matchKey(unitName, ctx.countryCode)}`;
      const earlier = fileNames.get(key);
      if (earlier !== undefined) errors.push(`Same name and parent as row ${earlier}`);
      else fileNames.set(key, row.rowNumber);
      if (liveNames.has(key)) errors.push(`"${unitName}" already exists under this parent; it can't be imported twice`);
    }
    if (unitCode) {
      const code = unitCode.toLowerCase();
      const earlier = fileCodes.get(code);
      if (earlier !== undefined) errors.push(`Same code as row ${earlier}`);
      else fileCodes.set(code, row.rowNumber);
      if (liveCodes.has(code)) errors.push(`Code "${unitCode}" is already used by a live ${ctx.levelName}`);
    }

    const fields: AdminUnitStagedFields = {
      unitName,
      unitCode,
      parentRef: parentRef ?? null,
      parentId: parent?.id ?? null,
      parentName: parent?.unitName ?? null,
      levelName: ctx.levelName,
    };
    return { rowNumber: row.rowNumber, raw, geomSource, geomFormat, fields, errors, warnings };
  });
}
