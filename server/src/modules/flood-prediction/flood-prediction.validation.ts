import { z } from "zod";
import { PREDICTION_HORIZONS } from "./flood-prediction.types";

export const listPredictionsSchema = z.object({
  query: z.object({
    countryCode: z
      .string()
      .trim()
      .length(3)
      .transform((s) => s.toUpperCase())
      .default("NGA"),
    horizon: z.enum(PREDICTION_HORIZONS).default("7d"),
  }),
});

export type ListPredictionsQuery = z.infer<typeof listPredictionsSchema>["query"];

export const areaPredictionParamSchema = z.object({
  params: z.object({
    adminUnitId: z.uuid("Not a valid area id"),
  }),
});

export const generateAiOutlookSchema = z.object({
  params: z.object({
    adminUnitId: z.uuid("Not a valid area id"),
  }),
  body: z
    .object({
      horizon: z.enum(PREDICTION_HORIZONS).default("7d"),
    })
    .default({ horizon: "7d" }),
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
      publicOutlookHorizon: z.enum(PREDICTION_HORIZONS).optional(),
    })
    .strict(),
});

export type UpdatePredictionSettingsBody = z.infer<typeof updatePredictionSettingsSchema>["body"];
