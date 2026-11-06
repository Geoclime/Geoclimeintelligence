import { addMonths } from "./rainfall-summary";

// The same rule as the server's monthFrom (server/src/modules/satellite-flood/mbtiles-reader.ts).
const MONTH_IN_NAME = /(?:^|[^0-9])((?:19|20)\d{2})[-_.]?(0[1-9]|1[0-2])(?:[^0-9]|$)/;

/** "s1_flood_2016_08.mbtiles" -> "2016-08"; null when the name doesn't say. */
export function monthFromFileName(name: string): string | null {
  const match = MONTH_IN_NAME.exec(name);
  return match ? `${match[1]}-${match[2]}` : null;
}

/** What a chosen folder (or set of files) holds, before anything is sent. */
export interface MonthlyTiles {
  /** The .mbtiles files to check, in month order; files without a month in their name come last. */
  files: File[];
  /** Other files in the folder, left out (not .mbtiles). */
  otherFiles: number;
  /** A second file for a month already picked, left out so a month isn't imported twice. */
  duplicates: string[];
  /** The first and last month named, and the months between them that no file covers. */
  first: string | null;
  last: string | null;
  missing: string[];
  /** Files whose name doesn't say the month: the server refuses these in a batch. */
  unnamed: string[];
}

/**
 * Sorts the files of a folder of monthly tiles: keeps the .mbtiles, puts them in month order, drops a
 * second file for the same month, and lists the months missing between the first and last. Looks at
 * names only; the server still reads and checks every file.
 */
export function pickMonthlyTiles(chosen: File[]): MonthlyTiles {
  const tiles = chosen.filter((file) => file.name.toLowerCase().endsWith(".mbtiles"));
  const byMonth = new Map<string, File>();
  const duplicates: string[] = [];
  const unnamed: File[] = [];
  // Shortest name first, so "s1_flood_2016_01.mbtiles" wins over a copy named "s1_flood_2016_01 (1).mbtiles".
  for (const file of [...tiles].sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))) {
    const month = monthFromFileName(file.name);
    if (!month) unnamed.push(file);
    else if (byMonth.has(month)) duplicates.push(file.name);
    else byMonth.set(month, file);
  }
  const months = [...byMonth.keys()].sort();
  const first = months[0] ?? null;
  const last = months.at(-1) ?? null;
  const missing: string[] = [];
  if (first && last) {
    for (let month = first; month < last; month = addMonths(month, 1)) {
      if (!byMonth.has(month)) missing.push(month);
    }
  }
  return {
    files: [...months.map((month) => byMonth.get(month)!), ...unnamed],
    otherFiles: chosen.length - tiles.length,
    duplicates,
    first,
    last,
    missing,
    unnamed: unnamed.map((file) => file.name),
  };
}
