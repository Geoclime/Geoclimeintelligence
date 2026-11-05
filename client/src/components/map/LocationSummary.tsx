import { Link } from "react-router";
import type { LocateResult, LonLat } from "../../types/admin-unit.types";
import { formatCoordinates } from "../../utils/formatCoordinates";
import { googleMapsUrl } from "../../utils/google-maps";
import { Icon } from "../shared/Icon";
import { Spinner } from "../shared/Spinner";

/** The spot's coordinates, as a link that opens it in Google Maps in a new tab. */
export function CoordinatesLink({ point }: { point: LonLat }) {
  const text = formatCoordinates(point);
  return (
    <p className="location-summary__point">
      <a href={googleMapsUrl(point)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${text} in Google Maps (opens in a new tab)`} title="Open in Google Maps" data-cy="open-in-google-maps">
        {text}
        <Icon name="externalLink" size={12} />
      </a>
    </p>
  );
}

interface LocationSummaryProps {
  point: LonLat;
  result: LocateResult | null;
  loading: boolean;
  error: string | null;
  /** What this spot is, when it is more than a tapped point: "You are here", "Flood report". */
  title?: string;
}

/**
 * "You are in: Rivers State > Port Harcourt > Phward 17", with links to the LGA and ward pages.
 * Shared by the map-click popup and the "Where am I?" panel.
 */
export function LocationSummary({ point, result, loading, error, title }: LocationSummaryProps) {
  const lga = result?.units.find((u) => u.level === 2);
  const ward = result?.units.find((u) => u.level === 3);

  return (
    <div className="location-summary" data-cy="location-summary" aria-live="polite">
      {title && (
        <p className="location-summary__title" data-cy="location-title">
          {title}
        </p>
      )}
      <CoordinatesLink point={point} />
      {loading && (
        <p className="location-summary__status">
          <Spinner size="sm" decorative /> Finding the area…
        </p>
      )}
      {error && <p className="location-summary__status location-summary__status--muted">{error}</p>}
      {result && (
        <dl className="location-summary__list">
          {result.units.map((unit) => (
            <div key={unit.id} data-cy={`located-level-${unit.level}`}>
              <dt>{unit.levelName}</dt>
              <dd>
                {unit.level === 2 ? (
                  <Link to={`/places/${unit.id}`}>{unit.unitName}</Link>
                ) : unit.level === 3 && lga ? (
                  <Link to={`/places/${lga.id}/wards/${unit.id}`}>{unit.unitName}</Link>
                ) : (
                  unit.unitName
                )}
              </dd>
            </div>
          ))}
          {!ward && lga && (
            <div>
              <dt>Ward</dt>
              <dd className="location-summary__status--muted">Not available</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}
