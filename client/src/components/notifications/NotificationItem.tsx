import { Link } from "react-router";
import type { AppNotification, NotificationCategory } from "../../types/notification.types";
import { formatDateTime } from "../../utils/formatDate";
import { Icon, type IconName } from "../shared/Icon";
import "./notifications.css";

const CATEGORY_ICON: Record<NotificationCategory, IconName> = {
  flood_alerts: "alert",
  my_reports: "edit",
  review_queue: "inbox",
  account: "user",
};

interface NotificationItemProps {
  notification: AppNotification;
  /** Called when it is opened (it is then marked read). */
  onOpen: (notification: AppNotification) => void;
  compact?: boolean;
}

/** One notification: what it is about, when, and a link to where it leads. Unread ones stand out. */
export function NotificationItem({ notification, onOpen, compact = false }: NotificationItemProps) {
  const unread = notification.readAt === null;
  const content = (
    <>
      <span className={`notification-item__icon notification-item__icon--${notification.category}`} aria-hidden="true">
        <Icon name={CATEGORY_ICON[notification.category]} size={16} />
      </span>
      <span className="notification-item__text">
        <span className="notification-item__title">{notification.title}</span>
        <span className={`notification-item__body${compact ? " notification-item__body--clamp" : ""}`}>{notification.body}</span>
        <span className="notification-item__time">{formatDateTime(notification.createdAt)}</span>
      </span>
      {unread && <span className="notification-item__dot" aria-label="Unread" />}
    </>
  );

  return notification.link ? (
    <Link to={notification.link} className={`notification-item${unread ? " notification-item--unread" : ""}`} onClick={() => onOpen(notification)} data-cy="notification-item">
      {content}
    </Link>
  ) : (
    <button type="button" className={`notification-item${unread ? " notification-item--unread" : ""}`} onClick={() => onOpen(notification)} data-cy="notification-item">
      {content}
    </button>
  );
}
