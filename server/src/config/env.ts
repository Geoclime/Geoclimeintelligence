import { config } from "dotenv";
import { z } from "zod";

config({ quiet: true });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_SSL: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  // Path to a PEM CA certificate for hosts signed by a private CA (e.g. Aiven's project CA).
  DATABASE_SSL_CA: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().min(1, "FIREBASE_PROJECT_ID is required"),
  // Bootstraps the very first Administrator (Phase 2 decision 4). Optional; empty = off.
  BOOTSTRAP_ADMIN_EMAIL: z
    .string()
    .trim()
    .default("")
    .transform((value) => value.toLowerCase())
    .refine((value) => value === "" || z.email().safeParse(value).success, "BOOTSTRAP_ADMIN_EMAIL must be an email address"),
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0),
    ),
  // Proxies in front of the API (Render: 1). 0 = none, so req.ip is the connecting address.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  IMPORT_MAX_FILE_MB: z.coerce.number().int().positive().default(60),
  IMPORT_MAX_UNZIPPED_MB: z.coerce.number().int().positive().default(100),
  // One GeoPackage from an OpenStreetMap extract, unpacked on its own and streamed (Rivers State buildings: 104 MB).
  IMPORT_MAX_GPKG_MB: z.coerce.number().int().positive().default(200),
  IMPORT_MAX_ROWS: z.coerce.number().int().positive().default(100_000),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
    // The logger is configured from env, so this one startup failure goes straight to stderr.
    console.error(`Invalid environment configuration:\n${problems.join("\n")}`);
    throw new Error("Invalid environment configuration");
  }
  return parsed.data;
}

export const env = loadEnv();
