import { z } from "zod";
import { offsetPageQuerySchema } from "../../common/pagination/pagination";
import { NOTIFICATION_CATEGORIES } from "./notification.types";

export const listNotificationsSchema = z.object({
  query: offsetPageQuerySchema.extend({
    unread: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  }),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsSchema>["query"];

export const notificationIdSchema = z.object({ params: z.object({ id: z.uuid("Not a valid notification id") }) });

/** PUT /api/v1/notifications/preferences: one category's three channels. */
export const savePreferenceSchema = z.object({
  body: z
    .object({
      category: z.enum(NOTIFICATION_CATEGORIES),
      inApp: z.boolean(),
      email: z.boolean(),
      push: z.boolean(),
    })
    .strict(),
});
export type SavePreferenceBody = z.infer<typeof savePreferenceSchema>["body"];

/** A Firebase Cloud Messaging registration token for this browser or installed app. */
export const pushTokenSchema = z.object({
  body: z.object({ token: z.string().trim().min(20, "Not a push token").max(4096) }).strict(),
});
export type PushTokenBody = z.infer<typeof pushTokenSchema>["body"];
