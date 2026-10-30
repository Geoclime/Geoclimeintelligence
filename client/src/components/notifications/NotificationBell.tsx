import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { useNotifications } from "../../hooks/useNotifications";
import { Icon } from "../shared/Icon";
import { NotificationItem } from "./NotificationItem";
import "./notifications.css";

/**
 * The top bar's bell: the unread count, and a panel with the newest notifications, "Mark all as
 * read", and links to the inbox and settings. Esc or a click outside closes it.
 */
export function NotificationBell() {
  const { recent, unreadCount, loading, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // A page change (e.g. opening a notification's link) closes the panel.
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const onClick = (event: MouseEvent) => !root.current?.contains(event.target as Node) && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const label = unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";

  return (
    <div className="notification-bell" ref={root}>
      <button type="button" className="notification-bell__button" aria-label={label} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)} data-cy="notification-bell">
        <Icon name="bell" size={18} />
        {unreadCount > 0 && (
          <span className="notification-bell__count" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <div id={panelId} className="notification-panel" role="dialog" aria-label="Notifications" data-cy="notification-panel">
          <header className="notification-panel__header">
            <p className="notification-panel__title">Notifications</p>
            {unreadCount > 0 && (
              <button type="button" className="notification-panel__action" onClick={() => void markAllRead()} data-cy="mark-all-read">
                Mark all as read
              </button>
            )}
          </header>
          <div className="notification-panel__list">
            {recent.length === 0 ? (
              <p className="notification-panel__empty">{loading ? "Loading…" : "Nothing yet. Flood alerts for your area and updates on your reports appear here."}</p>
            ) : (
              recent.map((notification) => <NotificationItem key={notification.id} notification={notification} onOpen={(n) => void markRead(n.id)} compact />)
            )}
          </div>
          <footer className="notification-panel__footer">
            <Link to="/notifications">See all</Link>
            <Link to="/notifications#settings">
              <Icon name="edit" size={14} />
              Settings
            </Link>
          </footer>
        </div>
      )}
    </div>
  );
}
