import type { Repository } from "typeorm";
import { AppError } from "../../common/errors/app-error";
import { AppDataSource } from "../../config/data-source";
import { Country } from "./country.entity";
import type { CountryPatch, ICountryRepository, LevelCount, NewCountry } from "./country.types";

/**
 * Countries are keyed by their ISO code, not a uuid `id`, so this repository can't extend
 * BaseRepository<T> (whose findById assumes an `id` column). It follows the same rules: it is
 * the only code that touches the countries table, and services reach it through an interface.
 */
export class CountryRepository implements ICountryRepository {
  private static _instance?: CountryRepository;
  static get Instance(): CountryRepository {
    return (this._instance ??= new CountryRepository());
  }

  private get repo(): Repository<Country> {
    return AppDataSource.getRepository(Country);
  }

  findAll(): Promise<Country[]> {
    return this.repo.find({ order: { countryName: "ASC" } });
  }

  findByCode(countryCode: string): Promise<Country | null> {
    return this.repo.findOneBy({ countryCode });
  }

  async create(input: NewCountry): Promise<Country> {
    await this.repo.insert(input);
    const country = await this.findByCode(input.countryCode);
    if (!country) throw new AppError(500, "Country could not be created");
    return country;
  }

  async update(countryCode: string, patch: CountryPatch): Promise<Country | null> {
    await this.repo.manager.transaction(async (manager) => {
      if (Object.keys(patch).length > 0) await manager.update(Country, { countryCode }, patch);
      if (patch.levelNames) {
        // admin_units.level_name is a copy of countries.level_names[level]: keep them in step.
        await manager.query(
          `UPDATE admin_units
              SET level_name = ($2::text[])[level], updated_at = now()
            WHERE country_code = $1
              AND level <= cardinality($2::text[])
              AND level_name IS DISTINCT FROM ($2::text[])[level]`,
          [countryCode, patch.levelNames],
        );
      }
    });
    return this.findByCode(countryCode);
  }

  async countUnitsByLevel(countryCodes: string[]): Promise<LevelCount[]> {
    if (countryCodes.length === 0) return [];
    const rows: { countryCode: string; level: number; count: number }[] = await this.repo.query(
      `SELECT country_code AS "countryCode", level, count(*)::int AS count
         FROM admin_units
        WHERE country_code = ANY($1::char(3)[])
        GROUP BY country_code, level`,
      [countryCodes],
    );
    return rows;
  }
}
