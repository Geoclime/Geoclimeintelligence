import { z } from "zod";
import { countryCodeSchema } from "../admin-units/country.validation";

// Uploads arrive as multipart/form-data, so every field is a string and an untouched optional
// input arrives as "". This turns "" into "not sent".
const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);

const yearMonthSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "A month as YYYY-MM, e.g. 2016-08");

/**
 * POST /imports/satellite-flood: one month's tiles (.mbtiles) for a country, and where they come
 * from. The month is read from the file name (s1_flood_2016_08) unless it is given.
 */
export const startSatelliteFloodImportSchema = z.object({
  body: z
    .object({
      countryCode: countryCodeSchema,
      sourceId: z.uuid("Choose the data source these tiles come from"),
      yearMonth: z.preprocess(blankToUndefined, yearMonthSchema.optional()),
      title: z.preprocess(blankToUndefined, z.string().trim().min(1).max(200).optional()),
    })
    .strict(),
});
export type StartSatelliteFloodImportBody = z.infer<typeof startSatelliteFloodImportSchema>["body"];

export const liveSatelliteFloodSchema = z.object({ query: z.object({ countryCode: countryCodeSchema }) });
export type LiveSatelliteFloodQuery = z.infer<typeof liveSatelliteFloodSchema>["query"];

export const satelliteFloodImageSchema = z.object({ params: z.object({ id: z.uuid("Not a valid layer id") }) });
export const satelliteFloodForRunSchema = z.object({ params: z.object({ id: z.uuid("Not a valid import id") }) });
export const satelliteFloodAreaSchema = z.object({ params: z.object({ adminUnitId: z.uuid("Not a valid area id") }) });
