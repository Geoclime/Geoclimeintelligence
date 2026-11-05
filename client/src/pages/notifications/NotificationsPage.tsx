import { NotificationSettingsCard } from "../../components/notifications/NotificationSettingsCard";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import "../../components/notifications/notifications.css";

/**
 * The person's notification settings. The notifications themselves, read and unread, are in the
 * bell's panel in the top bar.
 */
export function NotificationsPage() {
  useDocumentTitle("Notifications");

  return (
    <div className="page" data-cy="notifications-page">
      <header className="page__header">
        <div>
          <p className="page__eyebrow">Account</p>
          <h1 className="page__title">Notifications</h1>
          <p className="page__lead">Choose how you hear about flood alerts for your area, updates on your reports, and changes to your access.</p>
        </div>
      </header>

      <div className="notifications-page__grid">
        <NotificationSettingsCard />
      </div>
    </div>
  );
}
