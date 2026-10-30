import { config } from "dotenv";
import { z } from "zod";

config({ quiet: true });

/** "true"/"false" (any case) to a boolean, with a default when unset. */
const bool = (fallback: boolean) =>
  z
    .enum(["true", "false", "TRUE", "FALSE", "True", "False", ""])
    .default(fallback ? "true" : "false")
    .transform((value) => (value === "" ? fallback : value.toLowerCase() === "true"));

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
  // Cloudinary stores flood-report media (photos, voice notes, videos, documents): one setting,
  // copied as-is from the Cloudinary dashboard ("API environment variable"):
  // cloudinary://<api_key>:<api_secret>@<cloud_name>. Optional: without it, photos and voice notes
  // are kept in the database and videos and documents are refused.
  CLOUDINARY_URL: z
    .string()
    .trim()
    .default("")
    .transform((value, ctx) => {
      if (!value) return null;
      const match = /^cloudinary:\/\/([^:@\s]+):([^@\s]+)@([\w-]+)\/?$/.exec(value.replace(/^CLOUDINARY_URL=/, ""));
      if (!match) {
        ctx.addIssue({ code: "custom", message: "CLOUDINARY_URL must look like cloudinary://<api_key>:<api_secret>@<cloud_name>" });
        return z.NEVER;
      }
      return { apiKey: match[1]!, apiSecret: match[2]!, cloudName: match[3]! };
    }),
  // Where the web app lives, for links in emails and push notifications.
  APP_URL: z
    .url("APP_URL must be a full URL, e.g. https://geoclime.example.com")
    .default("http://localhost:5173")
    .transform((url) => url.replace(/\/+$/, "")),
  // ── Email (optional), docs/email.md ──
  // smtp (Nodemailer) | apps_script (Google Apps Script web app) | none
  EMAIL_PROVIDER: z.enum(["smtp", "apps_script", "none"]).default("none"),
  // true: when the chosen provider fails, try the other one if it is configured.
  EMAIL_FALLBACK: bool(true),
  EMAIL_FROM_NAME: z.string().trim().default("GeoClime Intelligence"),
  EMAIL_REPLY_TO: z.string().trim().default("").refine((v) => v === "" || z.email().safeParse(v).success, "EMAIL_REPLY_TO must be an email address"),
  // Emails sent per worker tick (one tick every few seconds), so a big alert doesn't hit provider limits at once.
  EMAIL_MAX_PER_TICK: z.coerce.number().int().min(1).max(500).default(30),
  // Nodemailer / SMTP (for Gmail, use an app password).
  SMTP_HOST: z.string().trim().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().trim().default(""),
  SMTP_PASS: z.string().default(""),
  EMAIL_FROM_ADDRESS: z.string().trim().default("").refine((v) => v === "" || z.email().safeParse(v).success, "EMAIL_FROM_ADDRESS must be an email address"),
  // Apps Script web app URL ending in /exec, and the optional shared token it checks.
  EMAIL_APPS_SCRIPT_URL: z.string().trim().default("").refine((v) => v === "" || /^https:\/\/script\.google\.com\/.+\/exec$/.test(v), "EMAIL_APPS_SCRIPT_URL must be the web app URL ending in /exec"),
  EMAIL_APPS_SCRIPT_TOKEN: z.string().trim().default(""),
  // Push notifications (Firebase Cloud Messaging) need a service account: the JSON key file from
  // Firebase console > Project settings > Service accounts, pasted as-is or base64-encoded.
  // Empty: push notifications are off. Verifying sign-ins doesn't need it.
  FIREBASE_SERVICE_ACCOUNT: z
    .string()
    .trim()
    .default("")
    .transform((value, ctx) => {
      if (!value) return null;
      try {
        const json = value.startsWith("{") ? value : Buffer.from(value, "base64").toString("utf8");
        const parsed = JSON.parse(json) as { project_id?: string; client_email?: string; private_key?: string };
        if (!parsed.client_email || !parsed.private_key) throw new Error("missing fields");
        return { projectId: parsed.project_id ?? "", clientEmail: parsed.client_email, privateKey: parsed.private_key };
      } catch {
        ctx.addIssue({ code: "custom", message: "FIREBASE_SERVICE_ACCOUNT must be the service-account JSON (or it base64-encoded)" });
        return z.NEVER;
      }
    }),
}).superRefine((e, ctx) => {
  // The provider chosen must have what it needs; a fallback is used only if it is complete too.
  if (e.EMAIL_PROVIDER === "smtp" && !(e.SMTP_HOST && e.EMAIL_FROM_ADDRESS)) {
    ctx.addIssue({ code: "custom", path: ["SMTP_HOST"], message: "EMAIL_PROVIDER=smtp needs SMTP_HOST and EMAIL_FROM_ADDRESS" });
  }
  if (e.EMAIL_PROVIDER === "apps_script" && !e.EMAIL_APPS_SCRIPT_URL) {
    ctx.addIssue({ code: "custom", path: ["EMAIL_APPS_SCRIPT_URL"], message: "EMAIL_PROVIDER=apps_script needs EMAIL_APPS_SCRIPT_URL" });
  }
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
