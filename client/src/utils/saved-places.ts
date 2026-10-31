import type { LocateResult } from "../types/admin-unit.types";
import type { ClickedFeature, FacilityType, PlaceOnMap, SavedPlace } from "../types/map-layer.types";

/** "Phward 2, Port Harcourt, Rivers": the areas a spot is in, smallest first. Empty when it is in none. */
export function describeWhere(result: LocateResult | null): string {
  if (!result) return "";
  return [...result.units]
    .sort((a, b) => b.level - a.level)
    .map((unit) => unit.unitName)
    .join(", ");
}

/** The id of the facility dots on the map (map-style.ts overlayLayers). */
export const FACILITY_DOTS_LAYER = "infrastructure-dots";

/**
 * The place an administrator saved by hand under a click, if any. An imported facility is not one:
 * it is shown on the map but belongs to its data source, so there is nothing here to edit.
 */
export function handSavedPlaceIn(features: readonly ClickedFeature[]): PlaceOnMap | null {
  for (const feature of features) {
    const { properties, coordinates } = feature;
    if (feature.layerId !== FACILITY_DOTS_LAYER || properties.origin !== "manual" || !coordinates) continue;
    if (typeof properties.id !== "string" || typeof properties.facilityType !== "string" || typeof properties.osmClass !== "string") continue;
    return {
      id: properties.id,
      name: typeof properties.name === "string" ? properties.name : null,
      facilityType: properties.facilityType as FacilityType,
      osmClass: properties.osmClass,
      note: typeof properties.note === "string" && properties.note ? properties.note : null,
      point: coordinates,
    };
  }
  return null;
}

/** A place the server just returned, as the map and its popup hold it. */
export function placeOnMapFrom(place: SavedPlace): PlaceOnMap {
  return {
    id: place.id,
    name: place.name,
    facilityType: place.facilityType,
    osmClass: place.osmClass,
    note: place.note,
    point: [place.longitude, place.latitude],
  };
}
