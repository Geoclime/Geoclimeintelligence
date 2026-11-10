import type { Point } from "geojson";
import type { LayerFeatureCollection } from "./map-layer.types";

/** What kind of home it is (utils/household-details.ts has the words for each). */
export type HomeType = "house" | "compound" | "apartment" | "other";

/** What the household form holds, all as text; the hook turns it into a request. */
export interface HouseholdFormValues {
  label: string;
  note: string;
  people: string;
  homeType: HomeType | "";
  /** International format ("+2348031234567"), or "" for none. */
  phone: string;
}

/** A photo of a home. Mirrors HouseholdPhotoDto on the server; the file comes from the API's file route. */
export interface HouseholdPhoto {
  id: string;
  householdId: string;
  mimeType: string;
  byteSize: number;
  createdAt: string;
}

/** Mirrors server/src/modules/households/household.types.ts. */
export interface Household {
  id: string;
  label: string;
  note: string | null;
  people: number | null;
  homeType: HomeType | null;
  /** A number responders can call, in international format. */
  phone: string | null;
  photoCount: number;
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
  homeType: HomeType | null;
  phone: string | null;
  photoCount: number;
  note: string | null;
  mine: boolean;
  ownerName: string | null;
}

export type HouseholdFeatureCollection = LayerFeatureCollection<Point, HouseholdFeatureProperties>;

/** A household that matched a search. Mirrors HouseholdHitDto on the server. */
export interface HouseholdHit {
  id: string;
  label: string;
  homeType: HomeType | null;
  mine: boolean;
  /** The owner's name: only staff with households.view see someone else's. */
  ownerName: string | null;
  /** The ward and LGA it is in. */
  area: string | null;
  point: [number, number];
}

/** A household opened from the map. */
export interface HouseholdOnMap extends HouseholdFeatureProperties {
  point: [number, number];
}

export interface NewHouseholdBody {
  label: string;
  note?: string;
  people?: number;
  homeType?: HomeType;
  phone?: string;
  longitude: number;
  latitude: number;
}

export interface HouseholdPatch {
  label?: string;
  note?: string;
  people?: number | null;
  homeType?: HomeType | null;
  /** A blank number clears it. */
  phone?: string;
}
