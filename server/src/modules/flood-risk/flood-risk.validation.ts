import { z } from "zod";
import { latitudeSchema, longitudeSchema } from "../../common/geo/geo";
import { countryCodeSchema } from "../admin-units/country.validation";

// Uploads arrive as multipart/form-data, so every field is a string and an untouched optional
// input arrives as "". This turns "" into "not sent".
const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);

/** POST /imports/flood-risk: a classified GeoTIFF for a country, and where it comes from. */
export const startFloodRiskImportSchema = z.object({
  body: z
    .object({
      countryCode: countryCodeSchema,
      sourceId: z.uuid("Choose the data source this map comes from"),
      title: z.preprocess(blankToUndefined, z.string().trim().min(1).max(200).optional()),
    })
    .strict(),
});
export type StartFloodRiskImportBody = z.infer<typeof startFloodRiskImportSchema>["body"];

export const liveFloodRiskSchema = z.object({ query: z.object({ countryCode: countryCodeSchema }) });
export type LiveFloodRiskQuery = z.infer<typeof liveFloodRiskSchema>["query"];

export const floodRiskImageSchema = z.object({ params: z.object({ id: z.uuid("Not a valid map id") }) });
export const floodRiskForRunSchema = z.object({ params: z.object({ id: z.uuid("Not a valid import id") }) });
export const floodRiskAreaSchema = z.object({ params: z.object({ adminUnitId: z.uuid("Not a valid area id") }) });

export const atPointSchema = z.object({
  query: z.object({ lon: longitudeSchema, lat: latitudeSchema, countryCode: countryCodeSchema }),
});
export type AtPointQuery = z.infer<typeof atPointSchema>["query"];
