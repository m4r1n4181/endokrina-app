/**
 * Centralized config/env validation.
 * All environment variables are validated at startup — fail fast rather than at runtime.
 * Data residency / AWS region is a config value, never hardcoded (per compliance requirement).
 */
import { z } from "zod";

export const configSchema = z.object({
  // Server
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(5000),

  // Database (required)
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Auth — JWT signing
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().default("8h"),        // staff session duration
  REFRESH_TOKEN_EXPIRES_IN: z.string().default("7d"),

  // Magic link signing
  MAGIC_LINK_SECRET: z.string().min(32, "MAGIC_LINK_SECRET must be at least 32 characters"),
  // Link valid until appointment (not a short window) — per legal decision
  MAGIC_LINK_EXPIRES_DAYS: z.coerce.number().default(30), // practical upper bound

  // Patient identity verification — rate limiting
  DOB_MAX_ATTEMPTS: z.coerce.number().default(5),
  DOB_BLOCK_MINUTES: z.coerce.number().default(30),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  OTP_BLOCK_MINUTES: z.coerce.number().default(30),
  OTP_EXPIRES_MINUTES: z.coerce.number().default(10),

  // SMS OTP provider (interface only for MVP — provider pluggable via config)
  // Valid values: "twilio" | "aws_sns" | "stub" (stub = log to console, dev/test only)
  SMS_PROVIDER: z.enum(["twilio", "aws_sns", "stub"]).default("stub"),
  SMS_FROM_NUMBER: z.string().optional(),
  // Twilio (optional — only required if SMS_PROVIDER=twilio)
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  // AWS SNS (optional — only required if SMS_PROVIDER=aws_sns)
  AWS_REGION: z.string().default("eu-central-1"), // data residency config — never hardcoded
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_ENDPOINT_URL: z.string().url().optional(),

  // File storage — encrypted object storage
  // Storage provider: "s3" | "stub" (stub writes to local /tmp, dev only)
  STORAGE_PROVIDER: z.enum(["s3", "stub"]).default("stub"),
  STORAGE_BUCKET: z.string().optional(),
  // Max upload size in bytes (default 20 MB)
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().default(20 * 1024 * 1024),

  // Email notifications (doctor morning email, invitation dispatch)
  // Provider: "ses" | "smtp" | "stub"
  EMAIL_PROVIDER: z.enum(["ses", "smtp", "stub"]).default("stub"),
  EMAIL_FROM: z.string().default("noreply@thyroid-clinic.local"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  // Lab freshness warning threshold (per appointment type — this is the global default)
  LAB_FRESHNESS_THRESHOLD_DAYS: z.coerce.number().default(90),

  // Questionnaire auto-lock timing
  // "appointment_start" = lock exactly at scheduled_at (default per spec)
  QUESTIONNAIRE_LOCK_STRATEGY: z
    .enum(["appointment_start", "appointment_start_minus_minutes"] as const)
    .default("appointment_start"),
  QUESTIONNAIRE_LOCK_OFFSET_MINUTES: z.coerce.number().default(0),

  // Retention config — company decides, not clinic (per compliance)
  DOCUMENT_RETENTION_DAYS: z.coerce.number().default(365),

  // Background jobs (auto-lock, reminders, morning doctor email)
  JOBS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  JOBS_INTERVAL_SECONDS: z.coerce.number().default(60),
  REMINDER_HOURS_BEFORE: z.coerce.number().default(24),
  APP_TIMEZONE: z.string().default("Europe/Belgrade"),

  // CORS
  CORS_ORIGINS: z.string().default("*"),

  // API / app URL (used for API references)
  APP_BASE_URL: z.string().default("http://localhost:5000"),
  // Patient/staff portal URL — magic links must open the frontend, not the API
  PORTAL_BASE_URL: z.string().default("http://localhost:5173"),
})
.refine(
  (cfg) => !(cfg.NODE_ENV === "production" && cfg.CORS_ORIGINS === "*"),
  { message: "CORS_ORIGINS cannot be '*' in production", path: ["CORS_ORIGINS"] }
)
.refine(
  (cfg) => cfg.STORAGE_PROVIDER !== "s3" || Boolean(cfg.STORAGE_BUCKET),
  { message: "STORAGE_BUCKET is required when STORAGE_PROVIDER=s3", path: ["STORAGE_BUCKET"] }
)
.refine(
  (cfg) => !(cfg.NODE_ENV === "production" && cfg.STORAGE_PROVIDER === "stub"),
  { message: "STORAGE_PROVIDER=stub is not allowed in production", path: ["STORAGE_PROVIDER"] }
);

function loadConfig() {
  const env = { ...process.env };
  if (env.NODE_ENV === "test" && env.JOBS_ENABLED === undefined) {
    env.JOBS_ENABLED = "false";
  }
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const errors = result.error.issues
      .map((i: { path: (string | number)[]; message: string }) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuration error:\n${errors}`);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;
