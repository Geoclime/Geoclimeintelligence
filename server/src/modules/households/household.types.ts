import type { Point } from "geojson";
import type { LayerFeatureCollection } from "../map-layers/map-layer.types";

/** A household as its owner, or a staff member, sees it. */
export interface HouseholdDto {
  id: string;
  label: string;
  note: string | null;
  /** How many people live there, if the owner said: what a rescue plans for. */
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
  longitude: number;
  latitude: number;
}

export interface HouseholdChanges {
  label: string;
  note: string | null;
  people: number | null;
}

export interface HouseholdRecord {
  id: string;
  ownerId: string;
  label: string;
  note: string | null;
  people: number | null;
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
