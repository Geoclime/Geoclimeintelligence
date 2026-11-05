import { Popup } from "react-map-gl/mapbox";
import type { LocateResult, LonLat } from "../../types/admin-unit.types";
import type { FloodRiskPoint } from "../../types/flood-risk.types";
import type { FeatureHere } from "../../utils/map-features";
import { Button } from "../shared/Button";
import { Icon } from "../shared/Icon";
import { LocationSummary } from "./LocationSummary";

interface AdminUnitPopupProps {
  point: LonLat;
  result: LocateResult | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  title?: string;
  /** What the flood risk map says at this spot; left out while the layer is off or no map is live. */
  floodRisk?: { risk: FloodRiskPoint | null; loading: boolean };
  /** Administrators only: offers to save this spot as a place (a facility the import missed). */
  onSavePlace?: () => void;
  /** The road and waterway drawn at the spot, if any (utils/map-features.ts). */
  here?: FeatureHere[];
  /** Anyone signed in: marks this spot as their household. */
  onMarkHousehold?: () => void;
}

/** "Click anywhere": the state, LGA and ward at the clicked spot, and its flood risk class, in a popup on the map. */
export function AdminUnitPopup({ point, result, loading, error, onClose, title, floodRisk, onSavePlace, here = [], onMarkHousehold }: AdminUnitPopupProps) {
  // Only inside a mapped area: the server refuses a place outside every boundary.
  const canSave = onSavePlace && !loading && result !== null && result.units.length > 0;
  const risk = floodRisk?.risk?.class ?? null;
  return (
    <Popup
      longitude={point[0]}
      latitude={point[1]}
      anchor="bottom"
      offset={8}
      maxWidth="280px"
      closeOnClick={false}
      onClose={onClose}
      className="admin-unit-popup"
    >
      <LocationSummary point={point} result={result} loading={loading} error={error} title={title} />
      {here.length > 0 && (
        <ul className="admin-unit-popup__here" aria-label="What is here" data-cy="popup-here">
          {here.map((item) => (
            <li key={item.kind}>
              <span className={`map-legend__swatch map-legend__swatch--${item.kind === "road" ? "roads" : "waterways"}`} aria-hidden="true" />
              <span>
                <strong>{item.title}</strong>
                {item.detail !== item.title && <span className="admin-unit-popup__here-detail"> · {item.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {floodRisk && (floodRisk.loading || floodRisk.risk) && (
        <p className="admin-unit-popup__risk" data-cy="popup-flood-risk">
          {floodRisk.loading ? (
            "Checking flood risk…"
          ) : risk ? (
            <>
              <span className="admin-unit-popup__risk-dot" style={{ background: risk.color }} aria-hidden="true" />
              Flood risk here: <strong>{risk.label}</strong>
            </>
          ) : (
            "No flood risk data here"
          )}
        </p>
      )}
      {onMarkHousehold && !loading && result !== null && result.units.length > 0 && (
        <Button variant="secondary" size="sm" fullWidth className="admin-unit-popup__save" icon={<Icon name="pin" size={14} />} onClick={onMarkHousehold} data-cy="mark-household-here">
          Mark my household here
        </Button>
      )}
      {canSave && (
        <Button variant="secondary" size="sm" fullWidth className="admin-unit-popup__save" icon={<Icon name="plus" size={14} />} onClick={onSavePlace} data-cy="save-place-here">
          Save this place
        </Button>
      )}
    </Popup>
  );
}
