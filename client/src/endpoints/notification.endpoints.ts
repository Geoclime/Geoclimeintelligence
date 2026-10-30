import { httpClient } from "../transport/http";
import type { ApiResponse } from "../types/api.types";
import type { AppNotification, NotificationPreference, NotificationPreferences } from "../types/notification.types";

// server/src/modules/notifications/notification.routes.ts. Every call acts on the signed-in
// person's own notifications, settings and devices.

export async function fetchNotifications(params: { page: number; pageSize: number; unread?: boolean }): Promise<ApiResponse<{ items: AppNotification[]; unreadCount: number }>> {
  const { data } = await httpClient.get<ApiResponse<{ items: AppNotification[]; unreadCount: number }>>("/api/v1/notifications", {
    params: { page: params.page, pageSize: params.pageSize, ...(params.unread ? { unread: "true" } : {}) },
  });
  return data;
}

export async function markNotificationRead(id: string): Promise<ApiResponse<{ unreadCount: number }>> {
  const { data } = await httpClient.post<ApiResponse<{ unreadCount: number }>>(`/api/v1/notifications/${encodeURIComponent(id)}/read`);
  return data;
}

export async function markAllNotificationsRead(): Promise<ApiResponse<{ unreadCount: number }>> {
  const { data } = await httpClient.post<ApiResponse<{ unreadCount: number }>>("/api/v1/notifications/read-all");
  return data;
}

export async function fetchNotificationPreferences(): Promise<ApiResponse<NotificationPreferences>> {
  const { data } = await httpClient.get<ApiResponse<NotificationPreferences>>("/api/v1/notifications/preferences");
  return data;
}

export async function saveNotificationPreference(preference: Omit<NotificationPreference, "label">): Promise<ApiResponse<NotificationPreferences>> {
  const { data } = await httpClient.put<ApiResponse<NotificationPreferences>>("/api/v1/notifications/preferences", preference);
  return data;
}

/** Registers this browser's push token for the signed-in person. */
export async function registerPushToken(token: string): Promise<void> {
  await httpClient.post("/api/v1/notifications/push-tokens", { token });
}

export async function unregisterPushToken(token: string): Promise<void> {
  await httpClient.delete("/api/v1/notifications/push-tokens", { data: { token } });
}
