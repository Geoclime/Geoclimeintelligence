import { z } from "zod";
import { latitudeSchema, longitudeSchema } from "../../common/geo/geo";
import { offsetPageQuerySchema } from "../../common/pagination/pagination";
import { REPORT_STATUSES, WATER_DEPTHS } from "./flood-report.types";

/** POST /api/v1/flood-reports (multipart). The fields arrive as text; the files are checked in the service. */
export const createReportSchema = z.object({
  body: z
    .object({
      lon: longitudeSchema,
      lat: latitudeSchema,
      locationName: z.string().trim().min(2, "Name the place, e.g. a street or landmark").max(200),
      waterDepth: z.enum(WATER_DEPTHS, { error: "Choose how deep the water is" }),
      description: z.string().trim().min(10, "Describe what you see in a sentence or two").max(2000),
    })
    .strict(),
});
export type CreateReportBody = z.infer<typeof createReportSchema>["body"];

export const listReportsSchema = z.object({
  query: offsetPageQuerySchema.extend({ status: z.enum(REPORT_STATUSES).optional() }),
});
export type ListReportsQuery = z.infer<typeof listReportsSchema>["query"];

export const myReportsSchema = z.object({ query: offsetPageQuerySchema });
export type MyReportsQuery = z.infer<typeof myReportsSchema>["query"];

export const reportIdSchema = z.object({ params: z.object({ id: z.uuid("Not a valid report id") }) });

export const reportMediaSchema = z.object({
  params: z.object({ id: z.uuid("Not a valid report id"), mediaId: z.uuid("Not a valid media id") }),
});

export const reviewReportSchema = z.object({
  params: z.object({ id: z.uuid("Not a valid report id") }),
  body: z
    .object({
      decision: z.enum(["publish", "reject"], { error: "Choose publish or reject" }),
      note: z.string().trim().max(500).optional().transform((value) => value || null),
    })
    .strict()
    .refine((body) => body.decision === "publish" || body.note, { path: ["note"], message: "Say why the report is rejected" }),
});
export type ReviewReportBody = z.infer<typeof reviewReportSchema>["body"];
