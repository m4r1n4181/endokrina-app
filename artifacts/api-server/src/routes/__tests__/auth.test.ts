import { afterAll, beforeAll, describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../app";
import { db, usersTable } from "../../lib/db";
import { eq } from "drizzle-orm";

const testEmail = "dr.jovic@clinic.test";
const testUserPhone = "+381641234567";

describe("POST /api/auth/login", () => {
  beforeAll(async () => {
    await db
      .update(usersTable)
      .set({ mfaEnabled: true, phone: testUserPhone })
      .where(eq(usersTable.email, testEmail));
  });

  afterAll(async () => {
    await db
      .update(usersTable)
      .set({ mfaEnabled: false, mfaOtpHash: null, mfaOtpExpiresAt: null, mfaOtpAttemptCount: 0, mfaOtpBlockedUntil: null })
      .where(eq(usersTable.email, testEmail));
  });

  it("rejects an invalid MFA token", async () => {
    const challenge = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: "Doctor1234!doc" });
    expect(challenge.status).toBe(401);

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: testEmail,
        password: "Doctor1234!doc",
        mfaToken: "000000",
      });

    expect(res.status).toBe(401);
  });
});