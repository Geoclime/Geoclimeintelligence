import { z } from "zod";
import { bboxQuerySchema } from "../../../common/geo/geo";
import { offsetPageQuerySchema } from "../../../common/pagination/pagination";
import { countryCodeSchema } from "../../admin-units/country.validation";
import { IMPORT_TARGETS } from "./import.types";

// Upload routes arrive as multipart/form-data, so every field is a string and an untouched
// optional input arrives as "". These helpers turn "" into "not sent".
const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(blankToUndefined, schema.optional());

const levelSchema = z.coerce.number().int().min(1, "level starts at 1").max(6, "level is at most 6");
const headingSchema = z.string().trim().min(1).max(200);

const columnMappingSchema = z
  .object({
    unit_name: headingSchema.optional(),
    unit_code: headingSchema.optional(),
    parent_code: headingSchema.optional(),
    geometry_wkt: headingSchema.optional(),
  })
  .strict();

const rainfallMappingSchema = z
  .object({
    area_code: headingSchema.optional(),
    area_name: headingSchema.optional(),
    year_month: headingSchema.optional(),
    rainfall_mm: headingSchema.optional(),
  })
  .strict();

/** columnMapping travels as a JSON string inside the multipart form. */
const jsonMappingField = <T extends z.ZodType>(schema: T) =>
  z
    .string({ error: "columnMapping is required" })
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: "custom", message: "columnMapping must be a JSON object" });
        return z.NEVER;
      }
    })
    .pipe(schema);

const sheetOptions = {
  sheetName: optional(z.string().trim().min(1).max(100)),
  headerRow: optional(z.coerce.number().int().min(1).max(1000)),
};

export const previewImportSchema = z.object({
  body: z
    .object({
      ...sheetOptions,
      countryCode: optional(countryCodeSchema),
      level: optional(levelSchema),
      parentId: optional(z.uuid()),
      /** Which kind of import the file is for, so the right sheet opens and the right columns are guessed. */
      target: optional(z.enum(IMPORT_TARGETS)),
    })
    .strict(),
});
export type PreviewImportBody = z.infer<typeof previewImportSchema>["body"];

export const startImportSchema = z.object({
  body: z
    .object({
      ...sheetOptions,
      countryCode: countryCodeSchema,
      level: levelSchema,
      sourceId: z.uuid("Choose the data source these areas come from"),
      parentId: optional(z.uuid()),
      columnMapping: jsonMappingField(columnMappingSchema),
    })
    .strict(),
});
export type StartImportBody = z.infer<typeof startImportSchema>["body"];

/** POST /imports/rainfall: monthly rainfall per area, for areas at `level` (2 = LGA in Nigeria). */
export const startRainfallImportSchema = z.object({
  body: z
    .object({
      ...sheetOptions,
      countryCode: countryCodeSchema,
      level: levelSchema,
      sourceId: z.uuid("Choose the data source this rainfall comes from"),
      columnMapping: jsonMappingField(rainfallMappingSchema),
    })
    .strict(),
});
export type StartRainfallImportBody = z.infer<typeof startRainfallImportSchema>["body"];

const runParams = z.object({ id: z.uuid("Not a valid import id") });

export const getImportSchema = z.object({
  params: runParams,
  query: offsetPageQuerySchema.extend({ status: z.enum(["passed", "failed"]).optional() }),
});
export type GetImportQuery = z.infer<typeof getImportSchema>["query"];

export const listImportsSchema = z.object({ query: offsetPageQuerySchema });
export type ListImportsQuery = z.infer<typeof listImportsSchema>["query"];

export const importGeoJsonSchema = z.object({
  params: runParams,
  query: z.object({ bbox: bboxQuerySchema }),
});
export type ImportGeoJsonQuery = z.infer<typeof importGeoJsonSchema>["query"];

export const promoteImportSchema = z.object({ params: runParams });

export const adminUnitTemplateSchema = z.object({
  query: z.object({
    country: countryCodeSchema,
    level: levelSchema,
    format: z.enum(["xlsx", "geojson"]).default("xlsx"),
  }),
});
export type AdminUnitTemplateQuery = z.infer<typeof adminUnitTemplateSchema>["query"];
