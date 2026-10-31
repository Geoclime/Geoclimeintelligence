import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { QUERY_KEYS, invalidateQueries } from "../cache/queryClient";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, registerPushToken } from "../endpoints/notification.endpoints";
import { useToast } from "../hooks/useToast";
import { currentPushToken } from "../transport/push-messaging";
import { connectRealtime, disconnectRealtime, onRealtime } from "../transport/realtime";
import type { AppNotification } from "../types/notification.types";

export interface NotificationContextValue {
  /** The newest notifications, for the bell's panel. */
  recent: AppNotification[];
  unreadCount: number;
  loading: boolean;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  refresh: () => void;
}

export const NotificationContext = createContext<NotificationContextValue | null>(null);

const RECENT = 10;
/** A slow safety net: the live connection normally delivers everything at once. */
const REFRESH_MS = 5 * 60 * 1000;

/**
 * The signed-in person's notifications, shared by the top bar's bell and the Notifications page.
 * Mounted in the signed-in shell only. It opens the live connection (transport/realtime.ts), so a
 * new notification appears and is announced the moment it is sent, and re-registers this
 * device's push token if push was turned on before (tokens change over time).
 */
export function NotificationProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const [recent, setRecent] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reloads, setReloads] = useState(0);

  const refresh = useCallback(() => setReloads((n) => n + 1), []);

  useEffect(() => {
    let current = true;
    fetchNotifications({ page: 1, pageSize: RECENT }).then(
      (response) => {
        if (!current || !response.data) return;
        setRecent(response.data.items);
        setUnreadCount(response.data.unreadCount);
        setLoading(false);
      },
      () => current && setLoading(false),
    );
    return () => {
      current = false;
    };
  }, [reloads]);

  useEffect(() => {
    connectRealtime();
    const stop = onRealtime<AppNotification>("notification:new", (notification) => {
      invalidateQueries(QUERY_KEYS.notifications);
      setRecent((list) => [notification, ...list.filter((n) => n.id !== notification.id)].slice(0, RECENT));
      setUnreadCount((n) => n + 1);
      showToast({ type: "info", message: notification.title });
    });
    const timer = window.setInterval(refresh, REFRESH_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop();
      disconnectRealtime();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, showToast]);

  // Keep this device's push token current when push is already allowed (it never prompts).
  useEffect(() => {
    void currentPushToken()
      .then((token) => (token ? registerPushToken(token) : undefined))
      .catch(() => undefined);
  }, []);

  const markRead = useCallback(async (id: string) => {
    const target = recent.find((n) => n.id === id);
    if (target?.readAt) return;
    setRecent((list) => list.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
    const response = await markNotificationRead(id);
    invalidateQueries(QUERY_KEYS.notifications);
    if (response.data) setUnreadCount(response.data.unreadCount);
  }, [recent]);

  const markAllRead = useCallback(async () => {
    setRecent((list) => list.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
    setUnreadCount(0);
    await markAllNotificationsRead();
    invalidateQueries(QUERY_KEYS.notifications);
  }, []);

  const value = useMemo<NotificationContextValue>(
    () => ({ recent, unreadCount, loading, markRead, markAllRead, refresh }),
    [recent, unreadCount, loading, markRead, markAllRead, refresh],
  );
  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}
