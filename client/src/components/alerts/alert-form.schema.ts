import { z } from "zod";
import { ALERT_SEVERITIES, type NewAlertBody, type UpdateAlertBody } from "../../types/alert.types";
import { formatDateTime } from "../../utils/formatDate";

/** Quick choices for how long an alert lasts. "Custom" lets the issuer type any number of days. */
export const DURATIONS = [
  { hours: 6, label: "6 hours" },
  { hours: 12, label: "12 hours" },
  { hours: 24, label: "24 hours" },
  { hours: 48, label: "2 days" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
] as const;

/** The value of the duration choice that opens the "Number of days" field. */
export const CUSTOM_DURATION = "custom";

/** Editing only: leave the alert's end time as it is. */
export const KEEP_DURATION = "keep";

/**
 * The most days an alert may last. Mirrors MAX_DURATION_DAYS on the server. It is a guard against
 * a mistyped 3650, not a policy: any whole number of days up to it is fine.
 */
export const MAX_CUSTOM_DAYS = 365;

/** Mirrors createAlertSchema and updateAlertSchema on the server (server/src/modules/alerts/alert.validation.ts). */
export const alertFormSchema = z
  .object({
    severity: z.enum(ALERT_SEVERITIES, { error: "Choose the alert level" }),
    title: z.string().trim().min(5, { error: "Give the alert a short title" }).max(160),
    message: z.string().trim().min(10, { error: "Say what is happening and where" }).max(2000),
    /** One action per line. */
    actions: z.string().max(3000),
    areaIds: z.array(z.string()).min(1, { error: "Choose at least one LGA or state" }).max(100),
    /** A number of hours from DURATIONS, CUSTOM_DURATION, or (editing) KEEP_DURATION. */
    durationHours: z.string(),
    /** Used only when durationHours is CUSTOM_DURATION. */
    customDays: z.string(),
    /** Editing only: tell everyone the alert covers about this change. */
    notify: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.durationHours !== CUSTOM_DURATION) return;
    const days = Number(values.customDays);
    if (values.customDays.trim() === "" || !Number.isInteger(days) || days < 1 || days > MAX_CUSTOM_DAYS) {
      context.addIssue({ code: "custom", path: ["customDays"], message: `Enter a whole number of days, from 1 to ${MAX_CUSTOM_DAYS}` });
    }
  });
export type AlertFormValues = z.infer<typeof alertFormSchema>;

type DurationValues = Pick<AlertFormValues, "durationHours" | "customDays">;

/** How many hours from now the alert lasts: a quick choice, or the typed number of days. NaN for "keep". */
function durationInHours(values: DurationValues): number {
  return values.durationHours === CUSTOM_DURATION ? Number(values.customDays) * 24 : Number(values.durationHours);
}

/** One recommended action per line, blanks dropped, at most 10 (the server's limit). */
function actionsOf(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10);
}

export function toAlertBody(values: AlertFormValues, now = Date.now()): NewAlertBody {
  return {
    severity: values.severity,
    title: values.title.trim(),
    message: values.message.trim(),
    actions: actionsOf(values.actions),
    areaIds: values.areaIds,
    expiresAt: new Date(now + durationInHours(values) * 3_600_000).toISOString(),
  };
}

/** The edit as the server wants it. The end time is only sent when the editor chose a new one. */
export function toAlertUpdate(values: AlertFormValues, now = Date.now()): UpdateAlertBody {
  return {
    severity: values.severity,
    title: values.title.trim(),
    message: values.message.trim(),
    actions: actionsOf(values.actions),
    areaIds: values.areaIds,
    notify: values.notify,
    ...(values.durationHours === KEEP_DURATION ? {} : { expiresAt: new Date(now + durationInHours(values) * 3_600_000).toISOString() }),
  };
}

/**
 * When the alert ends, written out ("30 Oct 2026, 14:00"): from now for a new choice, or the
 * alert's current end time when editing and keeping it. Null while the duration isn't a usable number.
 */
export function describeEnd(values: DurationValues, { currentEnd, now = Date.now() }: { currentEnd?: string; now?: number } = {}): string | null {
  if (values.durationHours === KEEP_DURATION) return currentEnd ? formatDateTime(currentEnd) : null;
  const hours = durationInHours(values);
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_CUSTOM_DAYS * 24) return null;
  return formatDateTime(new Date(now + hours * 3_600_000).toISOString());
}
