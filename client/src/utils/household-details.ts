import type { HomeType } from "../types/household.types";

/** The kinds of home the form offers. Mirrors HOME_TYPES in server/src/modules/households/household.types.ts. */
export const HOME_TYPE_OPTIONS: readonly { value: HomeType; label: string }[] = [
  { value: "house", label: "House" },
  { value: "compound", label: "Compound with several houses" },
  { value: "apartment", label: "Apartment or flat" },
  { value: "other", label: "Something else (a shop, an office…)" },
];

/** "House" for "house"; null when the owner didn't say. */
export function describeHomeType(value: HomeType | null): string | null {
  return HOME_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? null;
}

/** Photos one home may have. Mirrors MAX_HOUSEHOLD_PHOTOS on the server. */
export const MAX_HOUSEHOLD_PHOTOS = 3;

/** The line the household's photo picker carries: unlike the map's photos, these are private to the owner and staff. */
export const HOUSEHOLD_PHOTO_NOTE = "Avoid faces and number plates. Only you and staff can see these photos, never the public map.";
