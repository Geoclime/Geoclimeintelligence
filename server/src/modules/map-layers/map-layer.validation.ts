import { z } from "zod";
import { bboxQuerySchema } from "../../common/geo/geo";
import { countryCodeSchema } from "../admin-units/country.validation";

const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());

/**
 * Map layer: full shapes, so the bbox is mandatory (backend standard section 10). A request for
 * a whole layer with no area is refused before it reaches the database.
 */
export const layerGeoJsonSchema = z.object({
  query: z.object({
    bbox: bboxQuerySchema,
    zoom: z.coerce.number().min(0).max(24).optional(),
  }),
});
export type LayerGeoJsonQueryInput = z.infer<typeof layerGeoJsonSchema>["query"];

export const uploadMapLayerSchema = z.object({
  body: z
    .object({
      countryCode: countryCodeSchema,
      layer: z.enum(
        ["roads", "waterways", "settlements", "infrastructure", "buildings", "zip"],
        "Choose roads, waterways, settlements, infrastructure, buildings or the delivery zip",
      ),
      sourceId: optional(z.uuid("Choose the data source these features come from")),
      wardLevel: optional(z.coerce.number().int().min(1).max(6)),
      // A form field, so it arrives as text. Only GeoPackages read it (a cut-short file with rows missing).
      acceptPartial: optional(z.enum(["true", "false"]).transform((value) => value === "true")),
    })
    .superRefine((body, ctx) => {
      if (body.layer !== "zip" && !body.sourceId) {
        ctx.addIssue({
          code: "custom",
          path: ["sourceId"],
          message: "Choose the data source this file comes from (or upload the delivery zip with provenance.json)",
        });
      }
    }),
});
export type UploadMapLayerBody = z.infer<typeof uploadMapLayerSchema>["body"];

export const clearMapLayerSchema = z.object({
  body: z.object({
    countryCode: countryCodeSchema,
    layers: z
      .array(z.enum(["roads", "waterways", "settlements", "infrastructure", "buildings"]))
      .min(1, "Choose at least one layer to clear"),
  }),
});
export type ClearMapLayerBody = z.infer<typeof clearMapLayerSchema>["body"];
