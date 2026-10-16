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
  // Encrypts stored AI provider keys (docs/ai-integration.md). Optional; without it no key can
  // be saved and AI stays off. Generate with `openssl rand -base64 32`.
  AI_KEYS_SECRET: z
    .string()
    .trim()
    .default("")
    .refine((value) => value === "" || value.length >= 32, "AI_KEYS_SECRET must be at least 32 characters"),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(90_000),
  // Only for the very longest generations; everything else uses AI_REQUEST_TIMEOUT_MS.
  AI_LONG_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(1_200_000),
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
