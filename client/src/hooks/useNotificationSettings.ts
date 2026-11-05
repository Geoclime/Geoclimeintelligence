import { useCallback, useEffect, useState } from "react";
import { QUERY_KEYS, LIVE_POLICY, SETTINGS_POLICY } from "../cache/queryClient";
import { fetchNotificationPreferences, fetchNotifications, registerPushToken, saveNotificationPreference, unregisterPushToken } from "../endpoints/notification.endpoints";
import { currentPushToken, deletePushToken, pushAvailability, pushPermission, requestPushToken, type PushAvailability } from "../transport/push-messaging";
import type { AppNotification, NotificationChannel, NotificationPreferences } from "../types/notification.types";
import { paginationDetails } from "../utils/pagination";
import { useLoader } from "./useLoader";

/** Which channels the person wants for each category. Saving one switch updates it at once, and puts it back if the save fails. */
export function useNotificationPreferences() {
  const { data, setData, ...state } = useLoader<NotificationPreferences>(
    [...QUERY_KEYS.settings, "notification-preferences"],
    async () => {
      const response = await fetchNotificationPreferences();
      if (!response.data) throw new Error(response.message || "The server returned no settings.");
      return response.data;
    },
    SETTINGS_POLICY,
  );

  const setChannel = useCallback(
    async (category: string, channel: NotificationChannel, on: boolean) => {
      const before = data;
      const row = data?.categories.find((c) => c.category === category);
      if (!row) return;
      const next = { ...row, [channel]: on };
      setData((current) => current && { ...current, categories: current.categories.map((c) => (c.category === category ? next : c)) });
      try {
        const { label: _label, ...preference } = next;
        const response = await saveNotificationPreference(preference);
        if (response.data) setData(() => response.data);
      } catch (error) {
        setData(() => before);
        throw error;
      }
    },
    [data, setData],
  );

  return { preferences: data, ...state, setChannel };
}

/** One page of the inbox, newest first, optionally only the unread ones. */
export function useNotificationInbox(page: number, unreadOnly: boolean, pageSize = 20) {
  const { data, ...state } = useLoader(
    [...QUERY_KEYS.notifications, page, pageSize, unreadOnly],
    async () => {
      const response = await fetchNotifications({ page, pageSize, unread: unreadOnly });
      return { items: response.data?.items ?? ([] as AppNotification[]), meta: response.meta ?? {} };
    },
    LIVE_POLICY,
  );
  return { items: data?.items ?? [], ...paginationDetails(data?.meta ?? {}), ...state };
}

/**
 * Push notifications on THIS device: whether they can be offered here, whether they are on, and
 * turning them on (the browser asks for permission) or off.
 */
export function usePushNotifications() {
  const [availability, setAvailability] = useState<PushAvailability | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let current = true;
    void pushAvailability().then(async (result) => {
      if (!current) return;
      setAvailability(result);
      setEnabled(result === "available" && (await currentPushToken()) !== null);
    });
    return () => {
      current = false;
    };
  }, []);

  const enable = useCallback(async (): Promise<"on" | "blocked"> => {
    setBusy(true);
    try {
      const token = await requestPushToken();
      if (!token) return "blocked";
      await registerPushToken(token);
      setEnabled(true);
      return "on";
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const token = await currentPushToken();
      if (token) await unregisterPushToken(token);
      await deletePushToken();
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }, []);

  return { availability, enabled, busy, blocked: availability === "available" && pushPermission() === "denied", enable, disable };
}
