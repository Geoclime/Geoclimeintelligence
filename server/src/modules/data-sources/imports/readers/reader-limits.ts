/** One import is one file of at most this many rows; larger datasets are split. */
export const MAX_IMPORT_ROWS = 20_000;

/** Upload size cap (multer limit). The real Phase 2 files are all under 1 MB. */
export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;

/** Makes headings unique ("name", "name (2)") so no column silently shadows another. */
export function uniqueHeadings(headings: string[]): string[] {
  const seen = new Map<string, number>();
  return headings.map((heading) => {
    const count = (seen.get(heading) ?? 0) + 1;
    seen.set(heading, count);
    return count === 1 ? heading : `${heading} (${count})`;
  });
}
