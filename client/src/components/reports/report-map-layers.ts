import { useState } from "react";
import type { MapLayerId } from "../map/map-style";

/** The switches under a report map: what each one turns on, and the legend swatch (map.css) that goes with it. */
export const LAYER_SWITCHES: { label: string; swatch: string; layers: MapLayerId[] }[] = [
  { label: "Boundaries", swatch: "lga", layers: ["state", "lga", "ward"] },
  { label: "Waterways", swatch: "waterways", layers: ["waterways"] },
  { label: "Wetlands", swatch: "wetlands", layers: ["wetlands"] },
  { label: "Roads", swatch: "roads", layers: ["roads"] },
  { label: "Buildings", swatch: "buildings", layers: ["buildings"] },
  { label: "Facilities", swatch: "facility-health", layers: ["infrastructure"] },
  { label: "Settlements", swatch: "settlements", layers: ["settlements"] },
];

const ALL_LAYERS: Record<MapLayerId, boolean> = {
  state: true,
  lga: true,
  ward: true,
  roads: true,
  waterways: true,
  settlements: true,
  infrastructure: true,
  buildings: true,
  wetlands: true,
  // Field survey, households and the flood surfaces are drawn on the full map only.
  floodExtents: false,
  drainage: false,
  floodRisk: false,
  satelliteFlood: false,
  floodPrediction: false,
  households: false,
};

/**
 * What a small report map shows and whether it is the street map or the aerial one. Everything the
 * platform draws is on to begin with. Satellite puts the building shapes away, since the photograph
 * already shows the buildings, and bringing the street map back puts them back.
 */
export function useReportMapLayers() {
  const [satellite, setSatellite] = useState(false);
  const [layers, setLayers] = useState<Record<MapLayerId, boolean>>(ALL_LAYERS);

  const chooseSatellite = (next: boolean) => {
    setSatellite(next);
    setLayers((current) => ({ ...current, buildings: !next }));
  };
  const toggle = (ids: MapLayerId[], checked: boolean) => setLayers((current) => ({ ...current, ...Object.fromEntries(ids.map((id) => [id, checked])) }));

  return { satellite, layers, chooseSatellite, toggle };
}
