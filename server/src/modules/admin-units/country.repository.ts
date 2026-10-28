import type { Repository } from "typeorm";
import { AppError } from "../../common/errors/app-error";
import { AppDataSource } from "../../config/data-source";
import { Country } from "./country.entity";
import type { CountryPatch, ICountryRepository, LevelCount, NewCountry } from "./country.types";

const FOREIGN_KEY_VIOLATION = "23503";

function pgCode(err: unknown): string | undefined {
  const candidate = err as { code?: unknown; driverError?: { code?: unknown } } | null;
  const code = candidate?.code ?? candidate?.driverError?.code;
  return typeof code === "string" ? code : undefined;
}

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

  async deleteIfEmpty(countryCode: string): Promise<boolean> {
    // The NOT EXISTS guard and the admin_units foreign key (ON DELETE RESTRICT) both stop a
    // country with areas being deleted, even if an import promotes areas at the same moment.
    // Roads and waterways reference the country the same way; a country that still holds map
    // layer data is refused (false) rather than failing with a raw foreign-key error.
    try {
      const result = await this.repo
        .createQueryBuilder()
        .delete()
        .from(Country)
        .where("country_code = :countryCode", { countryCode })
        .andWhere("NOT EXISTS (SELECT 1 FROM admin_units au WHERE au.country_code = :countryCode)", { countryCode })
        .execute();
      return (result.affected ?? 0) > 0;
    } catch (err) {
      if (pgCode(err) === FOREIGN_KEY_VIOLATION) return false;
      throw err;
    }
  }

  async countUsersScopedToLevel(countryCode: string, level: number): Promise<number> {
    const [row]: { count: number }[] = await this.repo.query(
      `SELECT count(*)::int AS count
         FROM users u
         JOIN admin_units au ON au.id = u.scope_admin_unit_id
        WHERE au.country_code = $1 AND au.level = $2`,
      [countryCode, level],
    );
    return row?.count ?? 0;
  }

  async deleteLevel(countryCode: string, level: number): Promise<number | null> {
    try {
      // The NOT EXISTS guard and the foreign keys (children's parent_id and users' scope, both
      // ON DELETE RESTRICT) stop the delete if areas below, or a user, appeared since the checks.
      const result = await this.repo.manager
        .createQueryBuilder()
        .delete()
        .from("admin_units")
        .where("country_code = :countryCode AND level = :level", { countryCode, level })
        .andWhere("NOT EXISTS (SELECT 1 FROM admin_units c WHERE c.country_code = :countryCode AND c.level = :below)", {
          below: level + 1,
        })
        .execute();
      return result.affected ?? 0;
    } catch (err) {
      if (pgCode(err) === FOREIGN_KEY_VIOLATION) return null;
      throw err;
    }
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
