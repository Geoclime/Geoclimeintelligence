import { z } from "zod";

/**
 * Validated build-time configuration. Every VITE_ variable is compiled into the public bundle,
 * so nothing here may ever be a secret. Mirrors server/src/config/env.ts: check everything
 * once at startup and fail loudly, instead of failing later with an undefined URL.
 */

/** In e2e mode (Cypress) the fake identity provider replaces Firebase, so its keys are optional. */
export const IS_E2E = import.meta.env.MODE === "e2e";

const required = (name: string) => z.string().trim().min(1, `${name} is required`);

const firebaseSchema = z.object({
  VITE_FIREBASE_API_KEY: required("VITE_FIREBASE_API_KEY"),
  VITE_FIREBASE_AUTH_DOMAIN: required("VITE_FIREBASE_AUTH_DOMAIN"),
  VITE_FIREBASE_PROJECT_ID: required("VITE_FIREBASE_PROJECT_ID"),
  VITE_FIREBASE_APP_ID: z.string().trim().optional(),
});

const envSchema = z
  .object({
    VITE_API_URL: z
      .url("VITE_API_URL must be a full URL, e.g. http://localhost:4000")
      .transform((url) => url.replace(/\/+$/, "")),
  })
  .and(IS_E2E ? firebaseSchema.partial() : firebaseSchema);

export type Env = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(import.meta.env);

/** Human-readable problems, shown on the configuration error screen by main.tsx. */
export const envProblems: string[] = parsed.success
  ? []
  : parsed.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`);

/**
 * Only read after main.tsx has confirmed envProblems is empty; the app is not mounted otherwise,
 * so no module that depends on this ever runs with a bad configuration.
 */
export const env = (parsed.success ? parsed.data : {}) as Env;
