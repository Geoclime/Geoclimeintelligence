import { ConflictError, NotFoundError, ValidationError } from "../../common/errors/app-error";
import { CountryRepository } from "./country.repository";
import { toCountryDto, type CountryDto, type ICountryRepository, type LevelCount } from "./country.types";
import type { CreateCountryBody, UpdateCountryBody } from "./country.validation";

/**
 * Countries and their level names. Reads are open to any signed-in user; writes are guarded by
 * authorise("administrator") on the route. A country is reference geography, not region data,
 * so no region check applies (Administrators are never region-scoped anyway).
 */
export class CountryService {
  private static _instance?: CountryService;
  static get Instance(): CountryService {
    return (this._instance ??= new CountryService(CountryRepository.Instance));
  }

  // Public so tests can inject a fake repository; application code always uses .Instance.
  constructor(private readonly countries: ICountryRepository) {}

  async list(): Promise<CountryDto[]> {
    const countries = await this.countries.findAll();
    const counts = await this.countries.countUnitsByLevel(countries.map((c) => c.countryCode));
    return countries.map((country) => toCountryDto(country, counts));
  }

  async get(countryCode: string): Promise<CountryDto> {
    const country = await this.countries.findByCode(countryCode);
    if (!country) throw new NotFoundError("Country");
    return toCountryDto(country, await this.countries.countUnitsByLevel([countryCode]));
  }

  async create(input: CreateCountryBody): Promise<CountryDto> {
    if (await this.countries.findByCode(input.countryCode)) {
      throw new ConflictError(`A country with code ${input.countryCode} already exists`);
    }
    const country = await this.countries.create(input);
    return toCountryDto(country, []);
  }

  async update(countryCode: string, patch: UpdateCountryBody): Promise<CountryDto> {
    const existing = await this.countries.findByCode(countryCode);
    if (!existing) throw new NotFoundError("Country");

    const counts = await this.countries.countUnitsByLevel([countryCode]);
    if (patch.levelNames) {
      // A level that already holds areas can be renamed, but never removed.
      const deepestUsed = Math.max(0, ...counts.map((c) => c.level));
      if (patch.levelNames.length < deepestUsed) {
        const name = existing.levelNames[deepestUsed - 1] ?? `level ${deepestUsed}`;
        throw new ValidationError([
          {
            field: "levelNames",
            message: `${name} (level ${deepestUsed}) already has areas, so the country needs at least ${deepestUsed} levels`,
          },
        ]);
      }
    }

    const updated = await this.countries.update(countryCode, patch);
    if (!updated) throw new NotFoundError("Country");
    return toCountryDto(updated, counts);
  }

  /**
   * Deletes a country, but only while it holds no areas: a country with any state, LGA or ward
   * is never deleted (409). This is for removing a country created by mistake. Its imports
   * history is kept, since past runs are a record of what happened.
   */
  async delete(countryCode: string): Promise<void> {
    const existing = await this.countries.findByCode(countryCode);
    if (!existing) throw new NotFoundError("Country");

    const counts = await this.countries.countUnitsByLevel([countryCode]);
    const total = counts.reduce((sum, c) => sum + c.count, 0);
    if (total > 0) throw new ConflictError(hasAreasMessage(existing.countryName, existing.levelNames, counts));

    // The repository re-checks in the same statement, so areas promoted a moment ago still win.
    if (!(await this.countries.deleteIfEmpty(countryCode))) {
      throw new ConflictError(`${existing.countryName} now has areas, so it can't be deleted`);
    }
  }
}

/** "Nigeria has 341 areas (State 1, LGA 23, Ward 317), so it can't be deleted". */
function hasAreasMessage(countryName: string, levelNames: string[], counts: LevelCount[]): string {
  const total = counts.reduce((sum, c) => sum + c.count, 0);
  const byLevel = [...counts]
    .sort((a, b) => a.level - b.level)
    .map((c) => `${levelNames[c.level - 1] ?? `level ${c.level}`} ${c.count}`)
    .join(", ");
  return `${countryName} has ${total} ${total === 1 ? "area" : "areas"} (${byLevel}), so it can't be deleted`;
}
