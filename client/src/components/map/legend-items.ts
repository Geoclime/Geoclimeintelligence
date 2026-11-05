import type { LegendItem } from "./MapLegend";
import type { MapLayerId } from "./map-style";
import { DRAIN_STALE_DAYS } from "../../utils/drain-display";

/**
 * Legend rows, shared by the main map and the maps on an LGA's or ward's page so both explain the
 * same marks in the same words. Each row names the layer it belongs to; it is shown only while that
 * layer is on. Swatches are drawn by map.css in the colours map-style.ts and survey-style.ts paint with.
 */
export type LayerLegendItem = LegendItem & { layer: MapLayerId };

export const OVERLAY_LEGEND: readonly LayerLegendItem[] = [
  { key: "roads", label: "Roads (main to local)", swatch: "roads", layer: "roads" },
  { key: "waterways", label: "Rivers and creeks", swatch: "waterways", layer: "waterways" },
  { key: "waterbodies", label: "Wide rivers and water bodies", swatch: "waterbodies", layer: "waterways" },
  { key: "water-channel", label: "Canals and drains already in OpenStreetMap", swatch: "water-channel", layer: "waterways" },
  { key: "water-underground", label: "Water through a culvert or underground", swatch: "water-underground", layer: "waterways" },
  { key: "wetlands", label: "Mangrove, swamp and marsh", swatch: "wetlands", layer: "wetlands" },
  { key: "wetland-tidal", label: "Tidal flats", swatch: "wetland-tidal", layer: "wetlands" },
  { key: "settlements", label: "Settlements", swatch: "settlements", layer: "settlements" },
  { key: "buildings", label: "Buildings", swatch: "buildings", layer: "buildings" },
  { key: "facility-health", label: "Hospitals, clinics, pharmacies", swatch: "facility-health", layer: "infrastructure" },
  { key: "facility-education", label: "Schools and colleges", swatch: "facility-education", layer: "infrastructure" },
  { key: "facility-civic", label: "Police and government", swatch: "facility-civic", layer: "infrastructure" },
  { key: "facility-community", label: "Community centres and worship", swatch: "facility-community", layer: "infrastructure" },
  { key: "facility-other", label: "Markets, transport, water, telecom", swatch: "facility-other", layer: "infrastructure" },
  { key: "household-mine", label: "Your household (only you and staff see it)", swatch: "household-mine", layer: "households" },
  { key: "facility-letters", label: "Letters close up: H health, P police, S school, G government, M market, T transport, C community, W water", swatch: "facility-letter", layer: "infrastructure" },
];

export const SURVEY_LEGEND: readonly LayerLegendItem[] = [
  { key: "flood", label: "Flood, as recorded", swatch: "flood", layer: "floodExtents" },
  { key: "flood-receded", label: "Flood, receded", swatch: "flood-receded", layer: "floodExtents" },
  { key: "drain-clear", label: "Drain: clear", swatch: "drain-clear", layer: "drainage" },
  { key: "drain-partly", label: "Drain: partly blocked", swatch: "drain-partly", layer: "drainage" },
  { key: "drain-bad", label: "Drain: blocked, overflowing or damaged (drawn wider)", swatch: "drain-bad", layer: "drainage" },
  { key: "drain-covered", label: "Covered drain (dashed)", swatch: "drain-covered", layer: "drainage" },
  { key: "drain-flow", label: "Arrows: the way the water flows", swatch: "drain-flow", layer: "drainage" },
  { key: "drain-culvert", label: "Culvert", swatch: "drain-culvert", layer: "drainage" },
  { key: "drain-outfall", label: "Outfall", swatch: "drain-outfall", layer: "drainage" },
  { key: "drain-inlet", label: "Inlet or gully", swatch: "drain-inlet", layer: "drainage" },
  { key: "drain-pond", label: "Retention pond or basin", swatch: "drain-pond", layer: "drainage" },
  { key: "drain-cluster", label: "Several drainage points: tap to zoom in", swatch: "drain-cluster", layer: "drainage" },
  { key: "drain-stale", label: `Faded: not checked in ${DRAIN_STALE_DAYS} days or more`, swatch: "drain-stale", layer: "drainage" },
];

/** The rows for the layers that are on. */
export function legendFor(items: readonly LayerLegendItem[], on: Partial<Record<MapLayerId, boolean>>): LegendItem[] {
  return items.filter((item) => on[item.layer]).map(({ key, label, swatch }) => ({ key, label, swatch }));
}
