import { z } from "zod";
import type { BBox } from "../../types/admin-unit.types";
import type { Country, CountryPatch, NewCountryInput } from "../../types/country.types";

/**
 * The add/edit country form. Field names match the backend's country.validation.ts, so a 400's
 * field errors (countryCode, countryName, levelNames, bbox) land on the right inputs. The checks
 * here are for fast feedback only; the server re-checks everything.
 */

const bboxNumber = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max), {
      message: `${label} must be between ${min} and ${max}`,
    });

export const countryFormSchema = z
  .object({
    countryCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/, "Use the 3-letter ISO 3166-1 code, e.g. NGA"),
    countryName: z.string().trim().min(1, "Country name is required").max(100, "Keep the name under 100 characters"),
    levelNames: z
      .array(z.object({ name: z.string().trim().min(1, "A level name can't be blank").max(40, "Keep it under 40 characters") }))
      .min(1, "Add at least one level, e.g. State")
      .max(6, "A country can have at most 6 levels"),
    bbox: z.object({
      minLon: bboxNumber("West", -180, 180),
      minLat: bboxNumber("South", -90, 90),
      maxLon: bboxNumber("East", -180, 180),
      maxLat: bboxNumber("North", -90, 90),
    }),
  })
  .superRefine((values, ctx) => {
    const names = values.levelNames.map((level) => level.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: "custom", path: ["levelNames"], message: "Each level needs a different name" });
    }
    const parts = Object.values(values.bbox);
    const filled = parts.filter((part) => part !== "").length;
    if (filled > 0 && filled < 4) {
      ctx.addIssue({ code: "custom", path: ["bbox"], message: "Fill in all four edges, or leave them all empty" });
    } else if (filled === 4) {
      const [w, s, e, n] = [values.bbox.minLon, values.bbox.minLat, values.bbox.maxLon, values.bbox.maxLat].map(Number) as BBox;
      if (!(w < e && s < n)) ctx.addIssue({ code: "custom", path: ["bbox"], message: "West must be less than East, and South less than North" });
    }
  });

export type CountryFormValues = z.infer<typeof countryFormSchema>;
/** What the form holds before validation (the code isn't upper-cased yet). */
export type CountryFormInput = z.input<typeof countryFormSchema>;

export const EMPTY_COUNTRY_FORM: CountryFormInput = {
  countryCode: "",
  countryName: "",
  levelNames: [{ name: "" }],
  bbox: { minLon: "", minLat: "", maxLon: "", maxLat: "" },
};

export function countryToForm(country: Country): CountryFormInput {
  const [minLon, minLat, maxLon, maxLat] = country.bbox?.map(String) ?? ["", "", "", ""];
  return {
    countryCode: country.countryCode,
    countryName: country.countryName,
    levelNames: country.levels.map((level) => ({ name: level.name })),
    bbox: { minLon: minLon ?? "", minLat: minLat ?? "", maxLon: maxLon ?? "", maxLat: maxLat ?? "" },
  };
}

function toBBox(values: CountryFormValues["bbox"]): BBox | null {
  return values.minLon === "" ? null : ([values.minLon, values.minLat, values.maxLon, values.maxLat].map(Number) as BBox);
}

export function toNewCountry(values: CountryFormValues): NewCountryInput {
  return {
    countryCode: values.countryCode,
    countryName: values.countryName,
    levelNames: values.levelNames.map((level) => level.name),
    bbox: toBBox(values.bbox),
  };
}

/** Only what changed, so an edit never re-sends (and re-validates) untouched fields. */
export function toCountryPatch(values: CountryFormValues, original: Country): CountryPatch {
  const patch: CountryPatch = {};
  if (values.countryName !== original.countryName) patch.countryName = values.countryName;
  const levelNames = values.levelNames.map((level) => level.name);
  if (levelNames.join("\u0000") !== original.levels.map((level) => level.name).join("\u0000")) patch.levelNames = levelNames;
  const bbox = toBBox(values.bbox);
  if (JSON.stringify(bbox) !== JSON.stringify(original.bbox)) patch.bbox = bbox;
  return patch;
}
