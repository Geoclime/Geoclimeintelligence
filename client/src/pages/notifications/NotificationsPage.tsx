import { useSearchParams } from "react-router";
import { NotificationItem } from "../../components/notifications/NotificationItem";
import { NotificationSettingsCard } from "../../components/notifications/NotificationSettingsCard";
import { Button } from "../../components/shared/Button";
import { EmptyState } from "../../components/shared/EmptyState";
import { ErrorState } from "../../components/shared/ErrorState";
import { LoadingSpinner } from "../../components/shared/LoadingSpinner";
import { Pagination } from "../../components/shared/Pagination";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { useNotificationInbox } from "../../hooks/useNotificationSettings";
import { useNotifications } from "../../hooks/useNotifications";
import { parsePageParam } from "../../utils/pagination";
import "../../components/notifications/notifications.css";

/**
 * Every notification the person has had, newest first (or only the unread ones), with their
 * notification settings beside it. The bell in the top bar shows the newest few.
 */
export function NotificationsPage() {
  useDocumentTitle("Notifications");
  const [searchParams, setSearchParams] = useSearchParams();
  const unreadOnly = searchParams.get("show") === "unread";
  const page = parsePageParam(searchParams.get("page"));
  const { unreadCount, markRead, markAllRead } = useNotifications();
  const inbox = useNotificationInbox(page, unreadOnly);

  const show = (next: "all" | "unread") =>
    setSearchParams((params) => {
      if (next === "unread") params.set("show", "unread");
      else params.delete("show");
      params.delete("page");
      return params;
    });

  return (
    <div className="page" data-cy="notifications-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Account</p>
          <h1 className="page__title">Notifications</h1>
          <p className="page__lead">Flood alerts for your area, updates on your reports, and changes to your access.</p>
        </div>
      </header>

      <div className="notifications-page__grid">
        <section className="card notification-card" aria-labelledby="inbox-title">
          <div className="notifications-page__toolbar">
            <h2 id="inbox-title" className="notification-card__title">
              Inbox
            </h2>
            <div className="segmented" role="group" aria-label="Show">
              <button type="button" aria-pressed={!unreadOnly} onClick={() => show("all")}>
                All
              </button>
              <button type="button" aria-pressed={unreadOnly} onClick={() => show("unread")}>
                Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
              </button>
            </div>
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => void markAllRead().then(inbox.refetch)} data-cy="inbox-mark-all-read">
                Mark all as read
              </Button>
            )}
          </div>

          {inbox.loading && inbox.items.length === 0 ? (
            <LoadingSpinner message="Loading notifications…" />
          ) : inbox.error ? (
            <ErrorState message={inbox.error} onRetry={inbox.refetch} />
          ) : inbox.items.length === 0 ? (
            <EmptyState icon="bell" title={unreadOnly ? "You're all caught up" : "No notifications yet"} message="Flood alerts for your area and updates on your reports appear here." />
          ) : (
            <>
              <ul className="notification-list">
                {inbox.items.map((notification) => (
                  <li key={notification.id}>
                    <NotificationItem notification={notification} onOpen={(n) => void markRead(n.id).then(inbox.refetch)} />
                  </li>
                ))}
              </ul>
              <Pagination
                page={page}
                pageSize={inbox.pageSize}
                total={inbox.total}
                hasPrev={inbox.hasPrev}
                hasNext={inbox.hasNext}
                onPageChange={(next) =>
                  setSearchParams((params) => {
                    params.set("page", String(next));
                    return params;
                  })
                }
                itemLabel="notifications"
                disabled={inbox.loading}
              />
            </>
          )}
        </section>

        <NotificationSettingsCard />
      </div>
    </div>
  );
}
