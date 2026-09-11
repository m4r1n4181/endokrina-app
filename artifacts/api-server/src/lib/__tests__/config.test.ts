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
});