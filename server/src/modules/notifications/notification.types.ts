import type { UserRole } from "../../common/access/roles";
import type { PageMeta } from "../../common/response/api-response";

/** What a notification is about. Mirrored by the notifications CHECK constraints. */
export const NOTIFICATION_CATEGORIES = ["flood_alerts", "my_reports", "review_queue", "account"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const CHANNELS = ["inApp", "email", "push"] as const;
export type Channel = (typeof CHANNELS)[number];

/** Each category: what it is called, why someone gets it, and who it applies to. */
export const CATEGORY_INFO: Record<NotificationCategory, { label: string; reason: string; roles: readonly UserRole[] | "all" }> = {
  flood_alerts: { label: "Flood alerts", reason: "a flood alert covers your area", roles: "all" },
  my_reports: { label: "Your flood reports", reason: "a flood report you sent was reviewed", roles: "all" },
  review_queue: { label: "Reports to review", reason: "a flood report in your region needs reviewing", roles: ["emergency_responder", "government_official", "administrator"] },
  account: { label: "Account and access", reason: "of a change to your access, or a request an administrator answers", roles: "all" },
};

export function categoriesFor(role: UserRole): NotificationCategory[] {
  return NOTIFICATION_CATEGORIES.filter((category) => {
    const roles = CATEGORY_INFO[category].roles;
    return roles === "all" || roles.includes(role);
  });
}

export interface NotificationDto {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /** A path in the app, e.g. "/alerts". */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface PreferenceDto {
  category: NotificationCategory;
  inApp: boolean;
  email: boolean;
  push: boolean;
}

export interface NewNotification {
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  link: string | null;
}

export interface Contact {
  id: string;
  email: string | null;
  displayName: string | null;
}

/** What services depend on, so they can be unit-tested with an in-memory fake (section 2). */
export interface INotificationRepository {
  insertMany(rows: NewNotification[]): Promise<(NotificationDto & { userId: string })[]>;
  findInbox(userId: string, query: { page: number; pageSize: number; unreadOnly: boolean }): Promise<{ items: NotificationDto[]; meta: PageMeta }>;
  countUnread(userId: string): Promise<number>;
  /** False when the notification doesn't exist or isn't this person's. */
  markRead(userId: string, id: string): Promise<boolean>;
  markAllRead(userId: string): Promise<number>;

  /** Saved preferences for these people in one category; a person without a row has everything on. */
  findPreferences(userIds: string[], category: NotificationCategory): Promise<Map<string, Omit<PreferenceDto, "category">>>;
  findAllPreferences(userId: string): Promise<PreferenceDto[]>;
  savePreference(userId: string, preference: PreferenceDto): Promise<void>;

  addPushToken(userId: string, token: string, userAgent: string | null): Promise<void>;
  removePushToken(userId: string, token: string): Promise<void>;
  removePushTokens(tokens: string[]): Promise<void>;
  findPushTokens(userIds: string[]): Promise<string[]>;
  findContacts(userIds: string[]): Promise<Contact[]>;

  // Who an event reaches.
  findAlertRecipients(lgaIds: string[], excludeUserId: string | null): Promise<string[]>;
  findReviewers(lgaId: string | null, wardId: string | null, excludeUserId: string | null): Promise<string[]>;
  findAdministrators(): Promise<string[]>;
}
