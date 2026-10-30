import { usePwa } from "../../hooks/usePwa";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";

/**
 * "A new version is ready": shown when a new release has been downloaded in the background. The
 * user chooses when to reload, so nobody loses a half-written report to an automatic refresh.
 */
export function PwaUpdateBanner() {
  const { updateReady, applyUpdate, dismissUpdate } = usePwa();
  if (!updateReady) return null;
  return (
    <div className="pwa-update" role="status" data-cy="pwa-update">
      <Icon name="refresh" size={18} />
      <p className="pwa-update__text">A new version of GeoClime Intelligence is ready.</p>
      <div className="pwa-update__actions">
        <Button variant="ghost" size="sm" onClick={dismissUpdate}>
          Later
        </Button>
        <Button size="sm" onClick={applyUpdate}>
          Reload
        </Button>
      </div>
    </div>
  );
}
