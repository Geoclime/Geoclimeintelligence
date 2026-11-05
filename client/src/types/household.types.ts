import type { Point } from "geojson";
import type { LayerFeatureCollection } from "./map-layer.types";

/** Mirrors server/src/modules/households/household.types.ts. */
export interface Household {
  id: string;
  label: string;
  note: string | null;
  people: number | null;
  lgaId: string | null;
  wardId: string | null;
  longitude: number;
  latitude: number;
  /** It is the viewer's own. */
  mine: boolean;
  /** The owner's name: only staff with households.view see someone else's. */
  ownerName: string | null;
  createdAt: string;
}

export interface HouseholdFeatureProperties {
  id: string;
  label: string;
  people: number | null;
  note: string | null;
  mine: boolean;
  ownerName: string | null;
}

export type HouseholdFeatureCollection = LayerFeatureCollection<Point, HouseholdFeatureProperties>;

/** A household opened from the map. */
export interface HouseholdOnMap extends HouseholdFeatureProperties {
  point: [number, number];
}

export interface NewHouseholdBody {
  label: string;
  note?: string;
  people?: number;
  longitude: number;
  latitude: number;
}

export interface HouseholdPatch {
  label?: string;
  note?: string;
  people?: number | null;
}
