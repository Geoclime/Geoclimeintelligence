import type { Point } from "geojson";
import type { LayerFeatureCollection } from "../map-layers/map-layer.types";

/** What kind of home it is, as the form offers it. Mirrors ck_households_home_type and the client's utils/household-kinds.ts. */
export const HOME_TYPES = ["house", "compound", "apartment", "other"] as const;
export type HomeType = (typeof HOME_TYPES)[number];

/** A household as its owner, or a staff member, sees it. */
export interface HouseholdDto {
  id: string;
  label: string;
  note: string | null;
  /** How many people live there, if the owner said: what a rescue plans for. */
  people: number | null;
  homeType: HomeType | null;
  /** A number responders can call, in international format. Seen by the owner and staff, like everything here. */
  phone: string | null;
  /** How many photos of the home there are (the photos themselves come from /households/:id/photos). */
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
  mine: boolean;
  ownerName: string | null;
  note: string | null;
}

export type HouseholdFeatureCollection = LayerFeatureCollection<Point, HouseholdFeatureProperties>;

export interface NewHousehold {
  ownerId: string;
  countryCode: string;
  lgaId: string | null;
  wardId: string | null;
  label: string;
  note: string | null;
  people: number | null;
  homeType: HomeType | null;
  phone: string | null;
  longitude: number;
  latitude: number;
}

export interface HouseholdChanges {
  label: string;
  note: string | null;
  people: number | null;
  homeType: HomeType | null;
  phone: string | null;
}

export interface HouseholdRecord {
  id: string;
  ownerId: string;
  label: string;
  note: string | null;
  people: number | null;
  homeType: HomeType | null;
  phone: string | null;
  lgaId: string | null;
  wardId: string | null;
}

export interface IHouseholdRepository {
  findById(id: string): Promise<HouseholdRecord | null>;
  create(input: NewHousehold, viewerId: string): Promise<HouseholdDto>;
  update(id: string, changes: HouseholdChanges, viewerId: string): Promise<HouseholdDto | null>;
  delete(id: string): Promise<boolean>;
  /** The viewer's own households, newest first. */
  findMine(ownerId: string): Promise<HouseholdDto[]>;
  /** Households in the box: everyone's when `all`, otherwise only the viewer's own. */
  findGeoJson(bbox: [number, number, number, number], viewerId: string, all: boolean): Promise<HouseholdFeatureCollection>;
  /** The owners of households within `metres` of a flood (for "a flood was recorded near your home"). */
  ownersNearFlood(floodId: string, metres: number): Promise<{ ownerId: string; label: string; distanceM: number }[]>;
}
