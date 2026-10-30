import { useNotificationPreferences, usePushNotifications } from "../../hooks/useNotificationSettings";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../transport/api-error";
import type { NotificationChannel } from "../../types/notification.types";
import { Button } from "../shared/Button";
import { ErrorState } from "../shared/ErrorState";
import { Icon } from "../shared/Icon";
import { LoadingSpinner } from "../shared/LoadingSpinner";
import "./notifications.css";

const CHANNELS: { key: NotificationChannel; label: string }[] = [
  { key: "inApp", label: "In the app" },
  { key: "email", label: "Email" },
  { key: "push", label: "Push" },
];

/**
 * Turning push on for this browser, with a plain explanation of where it stands.
 * `hideWhenUnavailable`: show nothing at all where push can't be offered (the welcome screen).
 */
export function PushDeviceControl({ hideWhenUnavailable = false }: { hideWhenUnavailable?: boolean }) {
  const { availability, enabled, busy, blocked, enable, disable } = usePushNotifications();
  const { showToast } = useToast();
  if (availability === null) return null;
  if (hideWhenUnavailable && availability !== "available") return null;

  let text: string;
  if (availability === "not-configured") text = "Push notifications aren't available here yet.";
  else if (availability === "unsupported") text = "This browser can't show push notifications. On an iPhone, add the app to your Home Screen first.";
  else if (blocked) text = "Notifications are blocked for this site. Allow them in your browser's site settings, then try again.";
  else text = enabled ? "Push notifications are on for this device." : "Get alerts on this device even when the app is closed.";

  const toggle = async () => {
    try {
      if (enabled) {
        await disable();
        showToast({ type: "info", message: "Push notifications are off for this device." });
      } else if ((await enable()) === "on") {
        showToast({ type: "success", message: "Push notifications are on for this device." });
      }
    } catch (error) {
      showToast({ type: "error", message: errorMessage(error) });
    }
  };

  return (
    <div className="push-device" data-cy="push-device">
      <Icon name="bell" size={18} />
      <p>{text}</p>
      {availability === "available" && !blocked && (
        <Button variant={enabled ? "secondary" : "primary"} size="sm" onClick={toggle} loading={busy} data-cy="push-toggle">
          {enabled ? "Turn off on this device" : "Turn on push"}
        </Button>
      )}
    </div>
  );
}

/**
 * Notification settings: for each kind of notification, whether it comes in the app, by email
 * and by push. Everything starts on. Each switch saves at once.
 */
export function NotificationSettingsCard() {
  const { preferences, loading, error, refetch, setChannel } = useNotificationPreferences();
  const { showToast } = useToast();

  const change = async (category: string, channel: NotificationChannel, on: boolean) => {
    try {
      await setChannel(category, channel, on);
    } catch (failure) {
      showToast({ type: "error", message: `Your change wasn't saved: ${errorMessage(failure)}` });
    }
  };

  let body;
  if (loading && !preferences) body = <LoadingSpinner message="Loading your settings…" />;
  else if (error && !preferences) body = <ErrorState message={error} onRetry={refetch} />;
  else if (preferences) {
    const unavailable = CHANNELS.filter((c) => !preferences.channels[c.key]).map((c) => c.label.toLowerCase());
    body = (
      <>
        <div className="notification-settings__scroll">
          <table className="notification-settings" data-cy="notification-settings">
            <caption className="visually-hidden">Which notifications you get, and how</caption>
            <thead>
              <tr>
                <th scope="col">Notification</th>
                {CHANNELS.map((channel) => (
                  <th key={channel.key} scope="col">
                    {channel.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preferences.categories.map((row) => (
                <tr key={row.category}>
                  <th scope="row">{row.label}</th>
                  {CHANNELS.map((channel) => (
                    <td key={channel.key}>
                      <label className="switch">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={row[channel.key]}
                          disabled={!preferences.channels[channel.key]}
                          onChange={(event) => void change(row.category, channel.key, event.target.checked)}
                          data-cy={`pref-${row.category}-${channel.key}`}
                        />
                        <span className="switch__track" aria-hidden="true" />
                        <span className="visually-hidden">
                          {row.label}: {channel.label}
                        </span>
                      </label>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {unavailable.length > 0 && (
          <p className="notification-settings__note">{unavailable.join(" and ").replace(/^./, (c) => c.toUpperCase())} notifications aren't set up on this platform yet, so those switches are off for now.</p>
        )}
        {preferences.channels.push && <PushDeviceControl />}
      </>
    );
  }

  return (
    <section id="settings" className="card notification-card" aria-labelledby="notification-settings-title">
      <h2 id="notification-settings-title" className="notification-card__title">
        Notification settings
      </h2>
      <p className="notification-card__lead">Choose how each kind of notification reaches you. Everything starts on.</p>
      {body}
    </section>
  );
}
