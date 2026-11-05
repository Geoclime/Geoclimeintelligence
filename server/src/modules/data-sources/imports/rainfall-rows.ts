import { ValidationError } from "../../../common/errors/app-error";
import type { AdminUnitLookupRow } from "../../admin-units/admin-unit.types";
import { matchKey } from "../../admin-units/name-standards";
import type { LiveRainfallValue } from "../../rainfall/rainfall.types";
import type { ParsedFile, RainfallChange, RainfallColumnMapping, RainfallStagedFields, StagedRowInput } from "./import.types";

export interface RainfallRowContext {
  countryCode: string;
  /** "LGA", for messages. */
  levelName: string;
  /** Live areas at the level the rainfall is for: what a row's code or name can match. */
  areas: AdminUnitLookupRow[];
  /** What is live already for those areas, to tell new months from revised and unchanged ones. */
  live: LiveRainfallValue[];
  /** The current month, "YYYY-MM": later months are refused. */
  currentMonth: string;
}

/** Above this, a month's rainfall is past the world record (about 9,300 mm): a unit or typing error. */
const MAX_MONTHLY_MM = 10_000;
/** Above this, a month's rainfall is possible but rare enough to be worth a second look. */
const HIGH_MONTHLY_MM = 1_500;
const EARLIEST_YEAR = 1900;

/**
 * "2016-01", "2016-1", "2016/01", "2016-01-01" or "2016-01-01T00:00:00.000Z" (how an Excel date
 * cell reads) -> "2016-01". Null if it isn't a month.
 */
export function parseYearMonth(text: string): string | null {
  const match = /^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?(?:[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(text.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${String(month).padStart(2, "0")}`;
}

/** A plain decimal number ("15.719154818319", "0", "1e2"), or null. Thousands separators are not guessed at. */
function parseNumber(text: string): number | null {
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/** Rounded to the 3 decimals the live table stores, so a file and the table compare equal. */
function toStored(mm: number): number {
  return Math.round(mm * 1000) / 1000;
}

/**
 * Columns that hold each area's outline (CHIRPS from Earth Engine has a GeoJSON ".geo" column).
 * They are not stored with a rainfall row: the rainfall attaches to the live area's boundary,
 * and keeping a 7 KB outline on each of 3,000 staged rows would only bloat the audit trail.
 */
export function shapeColumns(headings: string[]): string[] {
  return headings.filter((heading) => /^\.?geo$|^geom$|geometry|wkt/i.test(heading.trim()));
}

/**
 * The rainfall checks, all in code (rainfall rows have no shape): the area is a live one, found
 * by code then by name (spelling variants included); the month is a real, past month; the value
 * is a number of millimetres; and no area and month appears twice (a repeat refuses the whole
 * file). Each row is then compared with what is live, so the admin sees what Promote would add,
 * fill in or replace before it does.
 * A row is never dropped or silently fixed: every problem is an error, every change a warning.
 */
export function prepareRainfallRows(
  file: ParsedFile,
  mapping: RainfallColumnMapping,
  ctx: RainfallRowContext,
): StagedRowInput<RainfallStagedFields>[] {
  const byCode = new Map<string, AdminUnitLookupRow>();
  const byKey = new Map<string, AdminUnitLookupRow[]>();
  for (const area of ctx.areas) {
    if (area.unitCode) byCode.set(area.unitCode.toLowerCase(), area);
    const key = matchKey(area.unitName, ctx.countryCode);
    byKey.set(key, [...(byKey.get(key) ?? []), area]);
  }
  const live = new Map(ctx.live.map((value) => [`${value.adminUnitId}|${value.yearMonth}`, value.rainfallMm]));
  const omitted = shapeColumns(file.headings);
  const seen = new Map<string, number>();
  const repeats: { row: number; earlier: number; area: string; yearMonth: string }[] = [];

  const rows = file.rows.map((row) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const raw = { ...row.values };
    for (const heading of omitted) delete raw[heading];
    const cell = (column: keyof RainfallColumnMapping) => {
      const heading = mapping[column];
      return heading ? (row.values[heading]?.trim() ?? null) || null : null;
    };

    // The area: by code first, then by name.
    const code = cell("area_code");
    const name = cell("area_name");
    let area: AdminUnitLookupRow | null = code ? (byCode.get(code.toLowerCase()) ?? null) : null;
    if (!code && !name) errors.push(`The ${ctx.levelName} code and name are both missing`);
    else if (!area && name) {
      const named = byKey.get(matchKey(name, ctx.countryCode)) ?? [];
      if (named.length === 1) {
        area = named[0]!;
        if (code) warnings.push(`Code "${code}" isn't a live ${ctx.levelName}'s code; matched by name to ${area.unitName}`);
      } else if (named.length > 1) errors.push(`"${name}" matches more than one ${ctx.levelName}; use its code instead`);
    }
    if (!area && errors.length === 0) {
      errors.push(
        code && name
          ? `No live ${ctx.levelName} has the code "${code}" or the name "${name}"`
          : code
            ? `No live ${ctx.levelName} has the code "${code}"`
            : `No live ${ctx.levelName} is called "${name}"`,
      );
    } else if (area && code && name && area.unitCode?.toLowerCase() === code.toLowerCase()) {
      if (matchKey(name, ctx.countryCode) !== matchKey(area.unitName, ctx.countryCode)) {
        warnings.push(`The name "${name}" doesn't match ${area.unitName}, the ${ctx.levelName} with code ${code}; matched by code`);
      }
    }

    // The month.
    const monthText = cell("year_month");
    const yearMonth = monthText ? parseYearMonth(monthText) : null;
    if (!monthText) errors.push("The month is missing");
    else if (!yearMonth) errors.push(`"${monthText}" is not a month; use YYYY-MM, e.g. 2016-01`);
    else if (Number(yearMonth.slice(0, 4)) < EARLIEST_YEAR) errors.push(`${yearMonth} is before ${EARLIEST_YEAR}`);
    else if (yearMonth > ctx.currentMonth) errors.push(`${yearMonth} is in the future`);

    // The value. Empty means the source hadn't finished the month (the latest month of an export).
    const valueText = cell("rainfall_mm");
    let rainfallMm: number | null = null;
    if (valueText) {
      const value = parseNumber(valueText);
      if (value === null) errors.push(`The rainfall "${valueText}" is not a number`);
      else if (value < 0) errors.push("The rainfall is negative");
      else if (value > MAX_MONTHLY_MM) errors.push(`${value} mm in one month is more than the world record; check the units`);
      else {
        rainfallMm = toStored(value);
        if (value > HIGH_MONTHLY_MM) warnings.push(`${rainfallMm} mm is unusually high for one month; check it`);
      }
    }

    // One value per area per month. A repeat refuses the whole file (below), not just this row.
    if (area && yearMonth) {
      const key = `${area.id}|${yearMonth}`;
      const earlier = seen.get(key);
      if (earlier !== undefined) repeats.push({ row: row.rowNumber, earlier, area: area.unitName, yearMonth });
      else seen.set(key, row.rowNumber);
    }

    // What Promote would do with it.
    let change: RainfallChange | null = null;
    let liveExists = false;
    let liveRainfallMm: number | null = null;
    if (errors.length === 0 && area && yearMonth) {
      const key = `${area.id}|${yearMonth}`;
      liveExists = live.has(key);
      liveRainfallMm = live.get(key) ?? null;
      if (!liveExists) {
        change = "new";
        if (rainfallMm === null) warnings.push(`No rainfall value: ${yearMonth} is stored as an incomplete month`);
      } else if (rainfallMm === null) {
        change = "unchanged";
        if (liveRainfallMm !== null) warnings.push(`No rainfall value in the file; the live value of ${liveRainfallMm} mm is kept`);
      } else if (liveRainfallMm === null) {
        change = "filled";
        warnings.push(`Fills in ${yearMonth}, which is live as an incomplete month`);
      } else if (toStored(liveRainfallMm) === rainfallMm) {
        change = "unchanged";
      } else {
        change = "revised";
        warnings.push(`Replaces the live value for ${yearMonth}: ${liveRainfallMm} mm becomes ${rainfallMm} mm`);
      }
    }

    const fields: RainfallStagedFields = {
      adminUnitId: area?.id ?? null,
      unitName: area?.unitName ?? name,
      unitCode: area?.unitCode ?? code,
      yearMonth,
      rainfallMm,
      change,
      liveExists,
      liveRainfallMm,
    };
    return { rowNumber: row.rowNumber, raw, geomSource: null, geomFormat: null, fields, errors, warnings };
  });

  // Two rows for one area and month can't both be right, and failing only the second would let
  // the first through as if it were the area's value. It usually means the file is for smaller
  // areas than the chosen level (CHIRPS per LGA read as per State: 23 rows a month, all "Rivers"),
  // so the whole file is refused and nothing is staged.
  if (repeats.length > 0) {
    const first = repeats[0]!;
    throw new ValidationError([
      {
        field: "level",
        message:
          `${repeats.length.toLocaleString("en")} rows have the same ${ctx.levelName} and month as an earlier row ` +
          `(first: row ${first.row} repeats row ${first.earlier}, ${first.area} ${first.yearMonth}). A rainfall file has one row per ` +
          `${ctx.levelName} per month. If this file is for smaller areas than ${ctx.levelName}s, choose that level instead; ` +
          "if the rows are true repeats, remove them. Nothing was stored.",
      },
    ]);
  }
  return rows;
}

/**
 * The run-level summary: what Promote would do, in a few sentences, so a monthly re-upload of
 * the whole history ("3,000 rows, 23 of them new") reads as expected rather than alarming.
 */
export function summariseRainfallRows(rows: StagedRowInput<RainfallStagedFields>[], omitted: string[], levelName: string): string[] {
  const count = (change: RainfallChange) => rows.filter((row) => row.errors.length === 0 && row.fields.change === change).length;
  const incomplete = rows.filter((row) => row.errors.length === 0 && row.fields.change === "new" && row.fields.rainfallMm === null).length;
  const n = (value: number) => value.toLocaleString("en");
  const warnings: string[] = [];

  if (omitted.length > 0) {
    warnings.push(
      `${omitted.map((h) => `"${h}"`).join(", ")} ${omitted.length === 1 ? "holds" : "hold"} each area's outline and ${omitted.length === 1 ? "was" : "were"} not stored: the rainfall attaches to the live ${levelName} boundaries instead.`,
    );
  }
  const unchanged = count("unchanged");
  if (unchanged > 0) {
    warnings.push(`${n(unchanged)} months are already live with the same value, so they are left as they are. That's expected when a file repeats earlier months.`);
  }
  const revised = count("revised");
  if (revised > 0) {
    warnings.push(`${n(revised)} months already live have a different value in this file. Promoting replaces them; each one says so in its row.`);
  }
  const filled = count("filled");
  if (filled > 0) warnings.push(`${n(filled)} months that were live as incomplete get their value from this file.`);
  if (incomplete > 0) {
    warnings.push(`${n(incomplete)} rows have no rainfall value (an incomplete month, usually the latest). They are stored without a value, and a later file fills them in.`);
  }
  return warnings;
}

/** "YYYY-MM" of a date, in UTC. */
export function monthOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}
