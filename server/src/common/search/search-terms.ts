/**
 * The words of a search, and the SQL that lines a stored name up with them, so "st marys" finds
 * "St. Mary's Hospital": everything is lowercased, apostrophes are dropped, and any other run of
 * punctuation counts as one space. Used by the place and household searches.
 */

/** The most words of a search that are used; the rest are ignored. */
export const MAX_SEARCH_WORDS = 6;

/** Lowercase words of a search with no punctuation, each at most 40 letters, each once. */
export function searchWords(q: string): string[] {
  const words = q
    .toLowerCase()
    .replace(/['’`]/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => word.slice(0, 40));
  return [...new Set(words)].slice(0, MAX_SEARCH_WORDS);
}

/** "hospitals" -> "hospital": plural forms of a word are searched as well. */
function stem(word: string): string {
  return word.length > 3 ? word.replace(/(?:es|s)$/, "") : word;
}

/**
 * LIKE patterns for one word: the word, and its singular. Words hold only letters and digits, so they
 * hold no LIKE wildcards.
 */
export function likePatterns(word: string): string[] {
  return [...new Set([`%${word}%`, `%${stem(word)}%`])];
}

/**
 * SQL for `expr` as search text: lowercased, apostrophes dropped, other punctuation as single spaces.
 * `expr` is always a fixed column expression, never text from a request.
 */
export function normSql(expr: string): string {
  return `regexp_replace(replace(replace(lower(${expr}), '''', ''), '’', ''), '[^[:alnum:]]+', ' ', 'g')`;
}
