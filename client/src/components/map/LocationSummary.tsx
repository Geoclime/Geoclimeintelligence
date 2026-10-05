import { Link } from "react-router";
import type { LocateResult, LonLat } from "../../types/admin-unit.types";
import { formatCoordinates } from "../../utils/formatCoordinates";
import { Spinner } from "../shared/Spinner";

interface LocationSummaryProps {
  point: LonLat;
  result: LocateResult | null;
  loading: boolean;
  error: string | null;
}

/**
 * "You are in: Rivers State > Port Harcourt > Phward 17", with links to the LGA and ward pages.
 * Shared by the map-click popup and the "Where am I?" panel.
 */
export function LocationSummary({ point, result, loading, error }: LocationSummaryProps) {
  const lga = result?.units.find((u) => u.level === 2);
  const ward = result?.units.find((u) => u.level === 3);

  return (
    <div className="location-summary" data-cy="location-summary" aria-live="polite">
      <p className="location-summary__point">{formatCoordinates(point)}</p>
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
