import { z } from "zod";

/**
 * Lenient Zod building blocks for model replies. Hosted providers enforce the JSON schema
 * themselves, but open models often get the content right and the shape slightly wrong; these
 * keep a usable draft while a genuinely missing essential still fails.
 */

const normalise = (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : "");

/** null/undefined -> ""; an array -> its items joined by newlines; an object -> JSON; else String(). */
export const looseText = z.preprocess((value) => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join("\n");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}, z.string());

/** null/undefined -> []. */
export const looseList = <T extends z.ZodType>(item: T) =>
  z.preprocess((value) => (value === null || value === undefined ? [] : value), z.array(item));

/** Case- and space-insensitive enum; anything unrecognised becomes `fallback`. */
export function looseChoice<const V extends readonly [string, ...string[]]>(values: V, fallback: V[number]) {
  return z.unknown().transform((value): V[number] => values.find((choice) => normalise(choice) === normalise(value)) ?? fallback);
}

/** Like looseChoice, but also accepts aliases ("approved" -> "accepted"); anything else stays an error. */
export function strictChoice<const V extends readonly [string, ...string[]]>(values: V, aliases: Record<string, V[number]> = {}) {
  const byAlias = new Map(Object.entries(aliases).map(([alias, choice]) => [normalise(alias), choice]));
  return z.preprocess(
    (value) => values.find((choice) => normalise(choice) === normalise(value)) ?? byAlias.get(normalise(value)) ?? value,
    z.enum(values),
  );
}

/** Why a reply was rejected, in words fed back to the model on its one retry. */
export function describeRejection(json: unknown, error: z.ZodError | null): string {
  if (json === null || typeof json !== "object" || Array.isArray(json)) return "it was not a JSON object";
  if (!error) return "it did not match the expected format";
  return error.issues
    .slice(0, 6)
    .map((issue) => `${issue.path.length > 0 ? issue.path.map(String).join(".") : "(the object)"}: ${issue.message}`)
    .join("; ");
}

/** Cuts text to a field's maximum length, at a word boundary when one is reasonably close. */
export function fit(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, Math.max(0, max - 1));
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
