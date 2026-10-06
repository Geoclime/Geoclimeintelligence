import { z } from "zod";
import { bboxQuerySchema, latitudeSchema, longitudeSchema } from "../../common/geo/geo";
import { offsetPageQuerySchema } from "../../common/pagination/pagination";
import { countryCodeSchema } from "./country.validation";

const levelSchema = z.coerce.number().int().min(1, "level starts at 1").max(6, "level is at most 6");
const idParams = z.object({ id: z.uuid("Not a valid area id") });

export const listAdminUnitsSchema = z.object({
  query: offsetPageQuerySchema.extend({
    countryCode: countryCodeSchema.optional(),
    level: levelSchema.optional(),
    parentId: z.uuid().optional(),
    q: z.string().trim().max(100).optional().transform((value) => value || undefined),
  }),
});
export type ListAdminUnitsQuery = z.infer<typeof listAdminUnitsSchema>["query"];

export const getAdminUnitSchema = z.object({ params: idParams });

export const listChildrenSchema = z.object({
  params: idParams,
  query: offsetPageQuerySchema,
});
export type ListChildrenQuery = z.infer<typeof listChildrenSchema>["query"];

/** Map layer: full shapes, so the bbox is mandatory (section 10). */
export const adminUnitGeoJsonSchema = z.object({
  query: z.object({
    level: levelSchema,
    bbox: bboxQuerySchema,
    countryCode: countryCodeSchema.optional(),
    parentId: z.uuid().optional(),
    zoom: z.coerce.number().min(0).max(24).optional(),
  }),
});
export type AdminUnitGeoJsonQuery = z.infer<typeof adminUnitGeoJsonSchema>["query"];

export const locateSchema = z.object({
  query: z.object({
    lon: longitudeSchema,
    lat: latitudeSchema,
    level: levelSchema.optional(),
  }),
});
export type LocateQuery = z.infer<typeof locateSchema>["query"];
