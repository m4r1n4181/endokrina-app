import { afterAll, beforeAll, describe, it, expect } from "vitest";
import request from "supertest";
import app from "../../app";
import { db, usersTable } from "../../lib/db";
import { eq } from "drizzle-orm";
import { hashOtp } from "../../services/patient-auth";
import { signStaffToken } from "../../services/auth";

const testEmail = "dr.jovic@clinic.test";
const testUserPhone = "+381641234567";
const testOtp = "123456";

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
      .set({ mfaEnabled: false, phone: testUserPhone, mfaOtpHash: null, mfaOtpExpiresAt: null, mfaOtpAttemptCount: 0, mfaOtpBlockedUntil: null })
      .where(eq(usersTable.email, testEmail));
  });

  it("rejects an invalid MFA token", async () => {
    const challenge = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: "Doctor1234!doc" });
    expect(challenge.status).toBe(401);
    expect(challenge.body.code).toBe("MFA_REQUIRED");

    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: testEmail,
        password: "Doctor1234!doc",
        mfaToken: "000000",
      });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_MFA");
  });

  it("accepts a valid SMS MFA token once", async () => {
    await db.update(usersTable).set({
      mfaOtpHash: hashOtp(testOtp),
      mfaOtpExpiresAt: new Date(Date.now() + 60_000),
      mfaOtpAttemptCount: 0,
      mfaOtpBlockedUntil: null,
    }).where(eq(usersTable.email, testEmail));

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, testEmail)).limit(1);
    const first = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: "Doctor1234!doc", mfaToken: testOtp });
    expect(first.status).toBe(200);
    expect(first.body.accessToken).toBeTypeOf("string");

    const second = await request(app)
      .post("/api/auth/login")
      .send({ email: testEmail, password: "Doctor1234!doc", mfaToken: testOtp });
    expect(second.status).toBe(401);
    expect(second.body.code).toBe("INVALID_MFA");
    expect(user).toBeDefined();
  });

  it("rejects enabling MFA without a phone number", async () => {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, testEmail)).limit(1);
    await db.update(usersTable).set({ phone: null, mfaEnabled: false }).where(eq(usersTable.email, testEmail));

    const res = await request(app)
      .patch("/api/auth/me/mfa")
      .set("Authorization", `Bearer ${signStaffToken(user!)}`)
      .send({ enabled: true });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MFA_PHONE_REQUIRED");
  });
});