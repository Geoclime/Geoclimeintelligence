// Mirrors server/src/modules/notifications/notification.types.ts.

export type NotificationCategory = "flood_alerts" | "my_reports" | "review_queue" | "account";

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /** A path in the app, e.g. "/alerts". */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  category: NotificationCategory;
  label: string;
  inApp: boolean;
  email: boolean;
  push: boolean;
}

/** GET /api/v1/notifications/preferences. */
export interface NotificationPreferences {
  categories: NotificationPreference[];
  /** Which channels the platform can send on at all (email and push need configuring on the server). */
  channels: { inApp: boolean; email: boolean; push: boolean };
}

export type NotificationChannel = "inApp" | "email" | "push";
