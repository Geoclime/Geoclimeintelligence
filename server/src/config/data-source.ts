import "reflect-metadata";
import { readFileSync } from "node:fs";
import path from "node:path";
import { DataSource } from "typeorm";
import { env } from "./env";
import { AdminUnit } from "../modules/admin-units/admin-unit.entity";
import { Country } from "../modules/admin-units/country.entity";
import { DataSourceRecord } from "../modules/data-sources/data-source.entity";
import { ImportRun, ImportStagingRow } from "../modules/data-sources/imports/import-run.entity";
import { DrainageFeature } from "../modules/field-survey/drainage-feature.entity";
import { FloodExtent } from "../modules/field-survey/flood-extent.entity";
import { Building } from "../modules/map-layers/building.entity";
import { Infrastructure } from "../modules/map-layers/infrastructure.entity";
import { Road } from "../modules/map-layers/road.entity";
import { SettlementPoint } from "../modules/map-layers/settlement-point.entity";
import { Waterway } from "../modules/map-layers/waterway.entity";
import { RainfallObservation } from "../modules/rainfall/rainfall-observation.entity";
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
  entities: [Role, User, DataSourceRecord, Country, AdminUnit, ImportRun, ImportStagingRow, Road, Waterway, SettlementPoint, Infrastructure, Building, RainfallObservation, FloodExtent, DrainageFeature],
  migrations: [path.join(__dirname, "..", "migrations", "*.ts")],
  // Passed to node-postgres' pool. Its defaults close a connection after 10 seconds idle, so a pause in use
  // means the next burst (the map asks for eight layers at once) opens a fresh connection for each, every one
  // with its own DNS lookup and TLS handshake to a host on the internet, and any lookup that fails shows as an
  // error. Keeping connections for five minutes, with keep-alive so a network that drops idle ones is noticed,
  // avoids most of that; and a connection that can't be made fails in 15 seconds instead of never.
  extra: { idleTimeoutMillis: 5 * 60_000, connectionTimeoutMillis: 15_000, keepAlive: true, keepAliveInitialDelayMillis: 10_000 },
  // Schema changes only ever happen through migrations -- never auto-sync.
  synchronize: false,
  logging: env.NODE_ENV === "development" ? ["error", "warn", "migration"] : ["error"],
});
