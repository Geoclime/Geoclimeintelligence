import { useContext } from "react";
import { NotificationContext, type NotificationContextValue } from "../contexts/NotificationContext";

/** The signed-in person's unread count and newest notifications, and the read actions. */
export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) throw new Error("useNotifications must be used inside <NotificationProvider>");
  return context;
}
