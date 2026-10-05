import { z } from "zod";
import { bboxArraySchema } from "../../common/geo/geo";

export const countryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use the 3-letter ISO 3166-1 code, e.g. NGA");

/** The country's own names for its levels, top first. Renaming or adding levels is allowed. */
const levelNamesSchema = z
  .array(z.string().trim().min(1, "A level name can't be blank").max(40, "Keep level names under 40 characters"))
  .min(1, "Give the country at least one level, e.g. State")
  .max(6, "A country can have at most 6 levels")
  .refine((names) => new Set(names.map((n) => n.toLowerCase())).size === names.length, {
    message: "Each level needs a different name",
  });

const countryParams = z.object({ code: countryCodeSchema });

export const getCountrySchema = z.object({ params: countryParams });

export const createCountrySchema = z.object({
  body: z
    .object({
      countryCode: countryCodeSchema,
      countryName: z.string().trim().min(1, "Country name is required").max(100),
      levelNames: levelNamesSchema,
      bbox: bboxArraySchema.nullish().transform((value) => value ?? null),
    })
    .strict(),
});
export type CreateCountryBody = z.infer<typeof createCountrySchema>["body"];

export const updateCountrySchema = z.object({
  params: countryParams,
  body: z
    .object({
      countryName: z.string().trim().min(1, "Country name can't be blank").max(100).optional(),
      levelNames: levelNamesSchema.optional(),
      bbox: bboxArraySchema.nullable().optional(),
    })
    .strict()
    .refine((body) => Object.values(body).some((value) => value !== undefined), {
      message: "Send countryName, levelNames or bbox to change",
    }),
});
export type UpdateCountryBody = z.infer<typeof updateCountrySchema>["body"];
