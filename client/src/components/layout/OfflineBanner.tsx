import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { Icon } from "../shared/Icon";

export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div className="offline-banner" role="status" data-cy="offline-banner">
      <Icon name="wifiOff" size={16} />
      <span>You're offline. What you see may be out of date, and changes can't be saved until you reconnect.</span>
    </div>
  );
}
