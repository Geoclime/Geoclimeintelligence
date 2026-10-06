import "reflect-metadata";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DataSource } from "typeorm";
import { env } from "./env";
import { AdminUnit } from "../modules/admin-units/admin-unit.entity";
import { Country } from "../modules/admin-units/country.entity";
import { DataSourceRecord } from "../modules/data-sources/data-source.entity";
import { ImportRun, ImportStagingRow } from "../modules/data-sources/imports/import-run.entity";
import { Role } from "../modules/users/role.entity";
import { User } from "../modules/users/user.entity";

// pg lets SSL params in the URL (sslmode, sslrootcert, ...) replace the `ssl` option wholesale,
// so strip them: DATABASE_SSL and DATABASE_SSL_CA are the only source of SSL settings.
function withoutSslParams(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("ssl") || key === "uselibpqcompat") url.searchParams.delete(key);
  }
  return url.toString();
}

/**
 * The one TypeORM DataSource for the app. Only repositories, the TypeORM CLI and admin
 * scripts may import this -- never a controller or service (section 3, AI rule 5).
 */
export const AppDataSource = new DataSource({
  type: "postgres",
  url: withoutSslParams(env.DATABASE_URL),
  ssl: env.DATABASE_SSL
    ? {
        rejectUnauthorized: true,
        ...(env.DATABASE_SSL_CA ? { ca: readFileSync(env.DATABASE_SSL_CA, "utf8") } : {}),
      }
    : false,
  entities: [Role, User, DataSourceRecord, Country, AdminUnit, ImportRun, ImportStagingRow],
  migrations: [path.join(__dirname, "..", "migrations", "*.ts")],
  // Schema changes only ever happen through migrations -- never auto-sync.
  synchronize: false,
  logging: env.NODE_ENV === "development" ? ["error", "warn", "migration"] : ["error"],
});
