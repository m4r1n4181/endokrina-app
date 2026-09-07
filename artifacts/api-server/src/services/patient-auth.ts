/**
 * Patient authentication service — preparation link + DOB + SMS OTP flow.
 * This is a custom flow, not standard username/password.
 *
 * Flow:
 *   1. Patient opens magic link (signed token)
 *   2. Patient enters full DOB → rate-limited, max DOB_MAX_ATTEMPTS before block
 *   3. On correct DOB → SMS OTP is sent to the phone number on file
 *   4. Patient enters OTP → rate-limited, max OTP_MAX_ATTEMPTS before block
 *   5. On correct OTP → patient session established (short-lived JWT)
 *
 * Stage 0 fallback: if SMS_PROVIDER=stub, OTP is logged to console only.
 * DOB-only must never be used as the model for real patient data.
 */
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../lib/config";
import type { PreparationLink } from "@workspace/db";

export interface PatientSessionPayload {
  sub: string;        // preparation link id
  appointmentId: string;
  type: "patient_session";
  iat?: number;
  exp?: number;
}

/**
 * Generate a cryptographically random preparation link token.
 */
export function generateLinkToken(): string {
  const payload = crypto.randomBytes(48).toString("base64url");
  const signature = crypto
    .createHmac("sha256", config.MAGIC_LINK_SECRET)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

/**
 * Verify the HMAC portion of a preparation link before looking it up.
 */
export function verifyLinkToken(token: string): boolean {
  const separator = token.lastIndexOf(".");
  if (separator <= 0 || separator === token.length - 1) return false;

  const payload = token.slice(0, separator);
  const providedSignature = token.slice(separator + 1);
  const expectedSignature = crypto
    .createHmac("sha256", config.MAGIC_LINK_SECRET)
    .update(payload)
    .digest("base64url");

  const provided = Buffer.from(providedSignature);
  const expected = Buffer.from(expectedSignature);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

/**
 * Check the configured lifetime of a preparation link.
 */
export function isMagicLinkExpired(link: Pick<PreparationLink, "createdAt">): boolean {
  const expiresAt = new Date(link.createdAt).getTime() + config.MAGIC_LINK_EXPIRES_DAYS * 24 * 60 * 60 * 1000;
  return Date.now() >= expiresAt;
}

/**
 * Generate a numeric OTP for SMS delivery.
 */
export function generateOtpCode(): string {
  // 6-digit numeric OTP
  const digits = crypto.randomInt(0, 1_000_000);
  return digits.toString().padStart(6, "0");
}

/**
 * Hash an OTP for storage (SHA-256, not bcrypt — OTPs are ephemeral/short-lived).
 */
export function hashOtp(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

/**
 * Verify a plaintext OTP against its stored hash.
 */
export function verifyOtp(code: string, storedHash: string): boolean {
  const hash = hashOtp(code);
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(storedHash));
}

/**
 * Check whether a preparation link is rate-limited for DOB attempts.
 */
export function isDobBlocked(link: PreparationLink): boolean {
  if (!link.dobBlockedUntil) return false;
  return new Date(link.dobBlockedUntil) > new Date();
}

/**
 * Check whether a preparation link is rate-limited for OTP attempts.
 */
export function isOtpBlocked(link: PreparationLink): boolean {
  if (!link.otpBlockedUntil) return false;
  return new Date(link.otpBlockedUntil) > new Date();
}

/**
 * Calculate block-until timestamp after max attempts exceeded.
 */
export function blockUntil(blockMinutes: number): Date {
  return new Date(Date.now() + blockMinutes * 60 * 1000);
}

/**
 * Issue a short-lived patient session JWT after successful OTP verification.
 */
export function signPatientSession(
  linkId: string,
  appointmentId: string
): string {
  const payload: PatientSessionPayload = {
    sub: linkId,
    appointmentId,
    type: "patient_session",
  };
  // Patient sessions are short (enough to complete the questionnaire)
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn: "4h" });
}

/**
 * Verify a patient session JWT.
 */
export function verifyPatientSession(token: string): PatientSessionPayload {
  const payload = jwt.verify(token, config.JWT_SECRET) as PatientSessionPayload;
  if (payload.type !== "patient_session") throw new Error("Invalid session type");
  return payload;
}
