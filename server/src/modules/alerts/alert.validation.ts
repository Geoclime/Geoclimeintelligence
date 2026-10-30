import { z } from "zod";
import { ALERT_SEVERITIES } from "./alert.types";

const MAX_DURATION_DAYS = 30;

/** POST /api/v1/alerts. Times are ISO strings; startsAt defaults to now. */
export const createAlertSchema = z.object({
  body: z
    .object({
      severity: z.enum(ALERT_SEVERITIES, { error: "Choose watch, warning or severe" }),
      title: z.string().trim().min(5, "Give the alert a short title").max(160),
      message: z.string().trim().min(10, "Say what is happening and where").max(2000),
      actions: z.array(z.string().trim().min(1).max(300)).max(10, "Keep to 10 actions or fewer").default([]),
      areaIds: z.array(z.uuid("Not a valid area id")).min(1, "Choose at least one area").max(100),
      startsAt: z.iso.datetime({ offset: true }).optional(),
      expiresAt: z.iso.datetime({ offset: true, error: "Set when the alert expires" }),
    })
    .strict()
    .refine((body) => new Date(body.expiresAt) > new Date(body.startsAt ?? Date.now()), {
      path: ["expiresAt"],
      message: "The alert must expire after it starts",
    })
    .refine((body) => new Date(body.expiresAt).getTime() - new Date(body.startsAt ?? Date.now()).getTime() <= MAX_DURATION_DAYS * 86_400_000, {
      path: ["expiresAt"],
      message: `An alert can last at most ${MAX_DURATION_DAYS} days; issue a new one to extend it`,
    }),
});
export type CreateAlertBody = z.infer<typeof createAlertSchema>["body"];

export const listAlertsSchema = z.object({
  query: z.object({ view: z.enum(["active", "recent"]).default("recent") }),
});
export type ListAlertsQuery = z.infer<typeof listAlertsSchema>["query"];

export const alertIdSchema = z.object({ params: z.object({ id: z.uuid("Not a valid alert id") }) });
