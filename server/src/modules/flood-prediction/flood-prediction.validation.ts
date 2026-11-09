import { z } from "zod";
import { DEFAULT_OUTLOOK_DAYS, MAX_OUTLOOK_DAYS, MIN_OUTLOOK_DAYS } from "./flood-prediction.types";

/** A whole number of days from MIN_OUTLOOK_DAYS to MAX_OUTLOOK_DAYS. Accepts "14" from a query string too. */
const outlookDays = z.coerce
  .number({ error: `Enter the number of days, from ${MIN_OUTLOOK_DAYS} to ${MAX_OUTLOOK_DAYS}` })
  .int(`Use a whole number of days, from ${MIN_OUTLOOK_DAYS} to ${MAX_OUTLOOK_DAYS}`)
  .min(MIN_OUTLOOK_DAYS, `Choose at least ${MIN_OUTLOOK_DAYS} day`)
  .max(MAX_OUTLOOK_DAYS, `Choose ${MAX_OUTLOOK_DAYS} days or fewer`);

export const listPredictionsSchema = z.object({
  query: z.object({
    countryCode: z
      .string()
      .trim()
      .length(3)
      .transform((s) => s.toUpperCase())
      .default("NGA"),
    days: outlookDays.default(DEFAULT_OUTLOOK_DAYS),
  }),
});

export type ListPredictionsQuery = z.infer<typeof listPredictionsSchema>["query"];

export const areaPredictionParamSchema = z.object({
  params: z.object({
    adminUnitId: z.uuid("Not a valid area id"),
  }),
  query: z.object({
    days: outlookDays.default(DEFAULT_OUTLOOK_DAYS),
  }),
});

export type AreaPredictionQuery = z.infer<typeof areaPredictionParamSchema>["query"];

export const generateAiOutlookSchema = z.object({
  params: z.object({
    adminUnitId: z.uuid("Not a valid area id"),
  }),
  body: z
    .object({
      days: outlookDays.default(DEFAULT_OUTLOOK_DAYS),
    })
    .default({ days: DEFAULT_OUTLOOK_DAYS }),
});

export type GenerateAiOutlookBody = z.infer<typeof generateAiOutlookSchema>["body"];

export const refreshPredictionsSchema = z.object({
  body: z
    .object({
      countryCode: z
        .string()
        .trim()
        .length(3)
        .transform((s) => s.toUpperCase())
        .default("NGA"),
    })
    .default({ countryCode: "NGA" }),
});

export type RefreshPredictionsBody = z.infer<typeof refreshPredictionsSchema>["body"];

export const draftAlertSchema = z.object({
  body: z
    .object({
      areaIds: z.array(z.uuid("Not a valid area id")).min(1, "Choose at least one area").max(25),
    })
    .strict(),
});

export type DraftAlertBody = z.infer<typeof draftAlertSchema>["body"];

export const updatePredictionSettingsSchema = z.object({
  body: z
    .object({
      showPublicFloodOutlook: z.boolean().optional(),
      publicOutlookDays: outlookDays.optional(),
    })
    .strict(),
});

export type UpdatePredictionSettingsBody = z.infer<typeof updatePredictionSettingsSchema>["body"];
