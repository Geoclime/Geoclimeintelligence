import { z } from "zod";
import { ALERT_SEVERITIES, type NewAlertBody } from "../../types/alert.types";

/** How long a new alert lasts. Longer than a week needs a fresh alert (the server allows 30 days). */
export const DURATIONS = [
  { hours: 6, label: "6 hours" },
  { hours: 12, label: "12 hours" },
  { hours: 24, label: "24 hours" },
  { hours: 48, label: "2 days" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
] as const;

/** Mirrors createAlertSchema on the server (server/src/modules/alerts/alert.validation.ts). */
export const alertFormSchema = z.object({
  severity: z.enum(ALERT_SEVERITIES, { error: "Choose the alert level" }),
  title: z.string().trim().min(5, { error: "Give the alert a short title" }).max(160),
  message: z.string().trim().min(10, { error: "Say what is happening and where" }).max(2000),
  /** One action per line. */
  actions: z.string().max(3000),
  areaIds: z.array(z.string()).min(1, { error: "Choose at least one LGA or state" }).max(100),
  durationHours: z.string(),
});
export type AlertFormValues = z.infer<typeof alertFormSchema>;

export function toAlertBody(values: AlertFormValues, now = Date.now()): NewAlertBody {
  return {
    severity: values.severity,
    title: values.title.trim(),
    message: values.message.trim(),
    actions: values.actions
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 10),
    areaIds: values.areaIds,
    expiresAt: new Date(now + Number(values.durationHours) * 3_600_000).toISOString(),
  };
}
