import { Link } from "react-router";
import { useAuth } from "../../hooks/useAuth";
import { useFloodAhead } from "../../hooks/useFloodAhead";
import { describeWarning, floodMapHref } from "../../utils/flood-ahead";
import { buttonClassName } from "../shared/Button";
import { Icon } from "../shared/Icon";
import "./flood-ahead.css";

/**
 * The warning itself: floods near you right now, nearest first, over whatever page is open. It stays
 * until dismissed, and a closer flood replaces a farther one. Rendered by both layouts, so it shows on
 * the public site too. "Show on map" only for people signed in, since the map needs it.
 */
export function FloodAheadBanner() {
  const { warnings, dismiss } = useFloodAhead();
  const { status } = useAuth();
  const [nearest, ...others] = warnings;
  if (!nearest) return null;

  return (
    <div className="flood-ahead-banner" role="alert" data-cy="flood-ahead-banner">
      <span className="flood-ahead-banner__icon">
        <Icon name="alert" size={22} />
      </span>
      <div className="flood-ahead-banner__body">
        <p className="flood-ahead-banner__title">Flooding near you</p>
        <p className="flood-ahead-banner__line" data-cy="flood-ahead-nearest">
          {describeWarning(nearest)}
        </p>
        {others.length > 0 && (
          <ul className="flood-ahead-banner__others">
            {others.map((warning) => (
              <li key={`${warning.kind}:${warning.id}`}>{describeWarning(warning)}</li>
            ))}
          </ul>
        )}
        <p className="flood-ahead-banner__advice">Slow down and take another route if you can. Never drive through floodwater.</p>
      </div>
      <div className="flood-ahead-banner__actions">
        {status === "signed-in" && (
          <Link to={floodMapHref(nearest)} onClick={dismiss} className={buttonClassName({ variant: "secondary", size: "sm" })} data-cy="flood-ahead-show">
            Show on map
          </Link>
        )}
        <button type="button" className="flood-ahead-banner__dismiss" onClick={dismiss} aria-label="Dismiss the flood warning" data-cy="flood-ahead-dismiss">
          <Icon name="close" size={18} />
        </button>
      </div>
    </div>
  );
}
