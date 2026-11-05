import type { HouseholdOnMap } from "../types/household.types";
import type { ClickedFeature, FacilityOrigin, FacilityType, PlaceOnMap } from "../types/map-layer.types";
import { FACILITY_DOTS_LAYER } from "./saved-places";

/**
 * What a click on the map landed on, beyond the boundaries: the facility it opens, and the road and
 * waterway at that spot for the "click anywhere" popup. Properties come back from the map as plain
 * values, so each is checked: a feature that doesn't look right is no feature.
 */

const ROAD_LAYERS = ["roads-major", "roads-secondary", "roads-local"];
const WATER_LAYERS = ["waterways-line", "waterways-channel", "waterways-underground", "waterways-fill"];

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

/** Any facility under the click, imported or saved by hand: everyone can open one to see what it is. */
export function facilityIn(features: readonly ClickedFeature[]): PlaceOnMap | null {
  for (const feature of features) {
    const { properties: p, coordinates } = feature;
    if (feature.layerId !== FACILITY_DOTS_LAYER || !coordinates) continue;
    const id = text(p.id);
    const facilityType = text(p.facilityType);
    const osmClass = text(p.osmClass);
    if (!id || !facilityType || !osmClass) continue;
    const origin: FacilityOrigin = p.origin === "manual" ? "manual" : "import";
    return { id, name: text(p.name), facilityType: facilityType as FacilityType, osmClass, note: text(p.note), point: coordinates, origin };
  }
  return null;
}

/** A household under the click (households-points in HouseholdLayer.tsx): the viewer's own, or, for staff, anyone's. */
export function householdIn(features: readonly ClickedFeature[]): HouseholdOnMap | null {
  for (const feature of features) {
    const { properties: p, coordinates } = feature;
    if (feature.layerId !== "households-points" || !coordinates) continue;
    const id = text(p.id);
    const label = text(p.label);
    if (!id || !label) continue;
    return {
      id,
      label,
      people: typeof p.people === "number" ? p.people : null,
      note: text(p.note),
      mine: p.mine === true,
      ownerName: text(p.ownerName),
      point: coordinates,
    };
  }
  return null;
}

/** Words for OSM's road classes, as a person on the ground would say them. */
const ROAD_WORDS: Readonly<Record<string, string>> = {
  motorway: "Expressway",
  trunk: "Highway",
  primary: "Main road",
  secondary: "Secondary road",
  tertiary: "Local through road",
  unclassified: "Minor road",
  residential: "Residential street",
  living_street: "Residential street",
  service: "Service road",
  track: "Track",
  path: "Path",
  footway: "Footpath",
};

export function describeRoadClass(roadClass: string): string {
  const base = roadClass.replace(/_link$/, "");
  return ROAD_WORDS[base] ?? "Road";
}

/** Mirrors WATER_CHANNEL_TYPES in components/map/map-style.ts. */
const CHANNEL_WORDS: Readonly<Record<string, string>> = { canal: "Canal", drain: "Drain", ditch: "Ditch" };

export function describeWaterway(props: { waterClass: string | null; waterwayType: string | null; tunnel: string | null }): string {
  const type = props.waterwayType?.toLowerCase() ?? "";
  const base =
    CHANNEL_WORDS[type] ??
    (props.waterClass === "river" ? "River" : props.waterClass === "creek" ? "Creek" : type === "stream" ? "Stream" : props.waterwayType ? "Waterway" : "Water body");
  const tunnel = props.tunnel?.toLowerCase();
  if (!tunnel || tunnel === "no") return base;
  return tunnel === "culvert" ? `${base}, through a culvert` : `${base}, underground here`;
}

export interface FeatureHere {
  kind: "road" | "water";
  /** "Aba Road", or the kind when it has no name. */
  title: string;
  /** "Highway · bridge", "River". */
  detail: string;
}

/** The first road and the first waterway under the click, for the popup's "Here" lines. */
export function featuresHere(features: readonly ClickedFeature[]): FeatureHere[] {
  const found: FeatureHere[] = [];
  const road = features.find((f) => ROAD_LAYERS.includes(f.layerId));
  if (road) {
    const roadClass = text(road.properties.roadClass) ?? "";
    const bridge = road.properties.isBridge === true;
    const detail = [describeRoadClass(roadClass), bridge ? "bridge" : null, text(road.properties.surface)].filter(Boolean).join(" · ");
    found.push({ kind: "road", title: text(road.properties.name) ?? describeRoadClass(roadClass), detail });
  }
  const water = features.find((f) => WATER_LAYERS.includes(f.layerId));
  if (water) {
    const detail = describeWaterway({
      waterClass: text(water.properties.waterClass),
      waterwayType: text(water.properties.waterwayType),
      tunnel: text(water.properties.tunnel),
    });
    found.push({ kind: "water", title: text(water.properties.name) ?? detail, detail });
  }
  return found;
}
