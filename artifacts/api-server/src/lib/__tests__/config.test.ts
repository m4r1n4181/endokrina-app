import { describe, expect, it } from "vitest";
import { configSchema } from "../config";

const baseConfig = {
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/endokrina_test",
  JWT_SECRET: "test-secret-min-32-characters-long-ok",
  MAGIC_LINK_SECRET: "test-secret-min-32-characters-long-ok",
};

describe("configuration validation", () => {
  it("rejects wildcard CORS in production", () => {
    const result = configSchema.safeParse({
      ...baseConfig,
      NODE_ENV: "production",
      CORS_ORIGINS: "*",
    });

    expect(result.success).toBe(false);
  });

  it("requires SMTP host and port when EMAIL_PROVIDER=smtp", () => {
    expect(configSchema.safeParse({ ...baseConfig, EMAIL_PROVIDER: "smtp" }).success).toBe(false);
    expect(
      configSchema.safeParse({ ...baseConfig, EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.example.com", SMTP_PORT: "587" }).success,
    ).toBe(true);
  });

  it("rejects EMAIL_PROVIDER=ses instead of silently dropping mail", () => {
    expect(configSchema.safeParse({ ...baseConfig, EMAIL_PROVIDER: "ses" }).success).toBe(false);
  });

  it("rejects an invalid APP_TIMEZONE", () => {
    expect(configSchema.safeParse({ ...baseConfig, APP_TIMEZONE: "Mars/Olympus" }).success).toBe(false);
    expect(configSchema.safeParse({ ...baseConfig, APP_TIMEZONE: "Europe/Belgrade" }).success).toBe(true);
  });

  it("defaults the morning briefing to 07:00 with a 5 hour catch-up window", () => {
    const parsed = configSchema.parse(baseConfig);
    expect(parsed.MORNING_BRIEFING_HOUR).toBe(7);
    expect(parsed.MORNING_BRIEFING_CATCHUP_HOURS).toBe(5);
  });

  it("rejects an out-of-range briefing hour", () => {
    expect(configSchema.safeParse({ ...baseConfig, MORNING_BRIEFING_HOUR: "24" }).success).toBe(false);
  });
});
