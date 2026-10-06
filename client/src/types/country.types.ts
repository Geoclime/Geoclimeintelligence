import type { BBox } from "./admin-unit.types";

export interface CountryLevel {
  level: number;
  name: string;
  unitCount: number;
}

/** Mirrors CountryDto in server/src/modules/admin-units/country.types.ts. */
export interface Country {
  countryCode: string;
  countryName: string;
  levels: CountryLevel[];
  bbox: BBox | null;
  createdAt: string;
  updatedAt: string;
}

/** Body for POST /api/v1/countries. */
export interface NewCountryInput {
  countryCode: string;
  countryName: string;
  levelNames: string[];
  bbox: BBox | null;
}

/** Body for PATCH /api/v1/countries/:code. Send only what changes. */
export interface CountryPatch {
  countryName?: string;
  levelNames?: string[];
  bbox?: BBox | null;
}
