import { Link } from "react-router";
import { useFloodAhead } from "../../hooks/useFloodAhead";
import { MAP_PATH } from "../../utils/map-url";
import { formatDistance } from "../../utils/flood-ahead";
import { Icon } from "../shared/Icon";
import "./flood-ahead.css";

/**
 * In the top bar while warnings are on, so it is never a surprise that the app is using your location
 * and keeping the screen awake. Links to the map, where it can be turned off.
 */
export function FloodAheadIndicator() {
  const { enabled, radiusM } = useFloodAhead();
  if (!enabled) return null;
  const label = `Flood warnings are on, within ${formatDistance(radiusM)}. Open the map to change or turn off.`;
  return (
    <Link to={MAP_PATH} className="app-topbar__help flood-ahead-indicator" aria-label={label} title={label} data-cy="flood-ahead-indicator">
      <Icon name="crosshair" size={18} />
      <span className="flood-ahead-indicator__dot" aria-hidden="true" />
    </Link>
  );
}
