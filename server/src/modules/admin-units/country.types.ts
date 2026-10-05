import type { BBox } from "../../common/geo/geo";
import type { Country } from "./country.entity";

export interface NewCountry {
  countryCode: string;
  countryName: string;
  levelNames: string[];
  bbox: BBox | null;
}

export interface CountryPatch {
  countryName?: string;
  levelNames?: string[];
  bbox?: BBox | null;
}

export interface LevelCount {
  countryCode: string;
  level: number;
  count: number;
}

/** What services depend on, so they can be unit-tested with an in-memory fake (section 2). */
export interface ICountryRepository {
  findAll(): Promise<Country[]>;
  findByCode(countryCode: string): Promise<Country | null>;
  create(input: NewCountry): Promise<Country>;
  /** Also renames admin_units.level_name for every level whose name changed, in one transaction. */
  update(countryCode: string, patch: CountryPatch): Promise<Country | null>;
  /** How many admin units each country has at each level. Only levels with at least one unit appear. */
  countUnitsByLevel(countryCodes: string[]): Promise<LevelCount[]>;
}

export interface CountryLevelDto {
  level: number;
  name: string;
  unitCount: number;
}

export interface CountryDto {
  countryCode: string;
  countryName: string;
  levels: CountryLevelDto[];
  bbox: BBox | null;
  createdAt: string;
  updatedAt: string;
}

export function toCountryDto(country: Country, counts: LevelCount[]): CountryDto {
  return {
    countryCode: country.countryCode,
    countryName: country.countryName,
    levels: country.levelNames.map((name, index) => ({
      level: index + 1,
      name,
      unitCount: counts.find((c) => c.countryCode === country.countryCode && c.level === index + 1)?.count ?? 0,
    })),
    bbox: country.bbox && country.bbox.length === 4 ? (country.bbox as BBox) : null,
    createdAt: country.createdAt.toISOString(),
    updatedAt: country.updatedAt.toISOString(),
  };
}
