import { Popup } from "react-map-gl/mapbox";
import type { LocateResult, LonLat } from "../../types/admin-unit.types";
import { LocationSummary } from "./LocationSummary";

interface AdminUnitPopupProps {
  point: LonLat;
  result: LocateResult | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
}

/** "Click anywhere": the state, LGA and ward at the clicked spot, in a popup on the map. */
export function AdminUnitPopup({ point, result, loading, error, onClose }: AdminUnitPopupProps) {
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
      <LocationSummary point={point} result={result} loading={loading} error={error} />
    </Popup>
  );
}
