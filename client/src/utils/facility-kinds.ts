import type { FacilityType } from "../types/map-layer.types";

export interface FacilityKind {
  /** The facility class the server stores and files under a type (layerRules.facilityTypeOf on the server). */
  value: string;
  label: string;
}

export interface FacilityKindGroup {
  type: FacilityType;
  label: string;
  kinds: readonly FacilityKind[];
}

/**
 * What an administrator can pick when saving a place by hand, grouped by the facility type the
 * server files it under. Every value is a Geofabrik class the import already understands, so a
 * place saved by hand is stored exactly like an imported one. Mirrors FACILITY_CLASSES in
 * server/src/modules/map-layers/layer-rules.ts; the server refuses any class it doesn't know.
 */
export const FACILITY_KIND_GROUPS: readonly FacilityKindGroup[] = [
  {
    type: "health",
    label: "Health",
    kinds: [
      { value: "hospital", label: "Hospital" },
      { value: "clinic", label: "Clinic or health centre" },
      { value: "doctors", label: "Doctor's surgery" },
      { value: "dentist", label: "Dentist" },
      { value: "pharmacy", label: "Pharmacy" },
      { value: "nursing_home", label: "Nursing home" },
    ],
  },
  {
    type: "emergency",
    label: "Emergency services",
    kinds: [
      { value: "police", label: "Police station" },
      { value: "fire_station", label: "Fire station" },
    ],
  },
  {
    type: "education",
    label: "Education",
    kinds: [
      { value: "school", label: "School" },
      { value: "kindergarten", label: "Nursery or kindergarten" },
      { value: "college", label: "College" },
      { value: "university", label: "University" },
    ],
  },
  {
    type: "government",
    label: "Government",
    kinds: [
      { value: "town_hall", label: "Town or council hall" },
      { value: "courthouse", label: "Court" },
      { value: "post_office", label: "Post office" },
    ],
  },
  {
    type: "market",
    label: "Markets",
    kinds: [
      { value: "marketplace", label: "Market" },
      { value: "mall", label: "Shopping mall" },
    ],
  },
  {
    type: "transport",
    label: "Transport",
    kinds: [
      { value: "ferry_terminal", label: "Ferry terminal or jetty" },
      { value: "bus_station", label: "Bus station" },
      { value: "railway_station", label: "Railway station" },
      { value: "airport", label: "Airport" },
      { value: "airfield", label: "Airfield" },
      { value: "helipad", label: "Helipad" },
    ],
  },
  {
    type: "community",
    label: "Community",
    kinds: [
      { value: "community_centre", label: "Community centre" },
      { value: "library", label: "Library" },
    ],
  },
  {
    type: "worship",
    label: "Places of worship",
    kinds: [
      { value: "christian", label: "Church" },
      { value: "muslim", label: "Mosque" },
    ],
  },
  {
    type: "water",
    label: "Water",
    kinds: [
      { value: "water_well", label: "Water well or borehole" },
      { value: "drinking_water", label: "Drinking water point" },
      { value: "water_tower", label: "Water tower" },
      { value: "water_works", label: "Water works" },
      { value: "wastewater_plant", label: "Wastewater plant" },
    ],
  },
  {
    type: "telecom",
    label: "Telecoms",
    kinds: [{ value: "comms_tower", label: "Communications tower" }],
  },
];

const KIND_LABELS = new Map(FACILITY_KIND_GROUPS.flatMap((group) => group.kinds.map((kind) => [kind.value, kind.label] as const)));

/** True for a class the picker offers. */
export function isPickableKind(value: string): boolean {
  return KIND_LABELS.has(value);
}

/** "Hospital" for "hospital"; a class the picker doesn't list (an imported "chemist") is made readable. */
export function describeKind(osmClass: string): string {
  const known = KIND_LABELS.get(osmClass);
  if (known) return known;
  const words = osmClass.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Place";
}
