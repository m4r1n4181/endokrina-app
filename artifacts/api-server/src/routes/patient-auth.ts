/**
 * Patient authentication routes — magic link + DOB + email OTP flow.
 * This is a custom flow for patients (not standard username/password).
 *
 * Endpoints:
 *   POST /api/patient-auth/verify-dob   — step 1: verify DOB on link token
 *   POST /api/patient-auth/verify-otp   — step 2: verify email OTP
 *   POST /api/patient-auth/resend-otp   — resend OTP (rate-limited)
 */
import { Router } from "express";
import { db, preparationLinksTable, appointmentsTable, patientsTable, AUDIT_ACTIONS } from "../lib/db";
import { eq, and } from "drizzle-orm";
import {
  generateOtpCode,
  hashOtp,
  verifyOtp,
  isDobBlocked,
  isOtpBlocked,
  blockUntil,
  signPatientSession,
  verifyLinkToken,
  isMagicLinkExpired,
} from "../services/patient-auth";
import { writeAuditLog, linkAuditCtx, unauthAuditCtx } from "../services/audit";
import { sendVerificationCodeEmail } from "../services/notifications";
import { config } from "../lib/config";
import { extractClientIp } from "../middlewares/audit-middleware";
import { z } from "zod";

const router = Router();

const verifyDobSchema = z.object({
  token: z.string().min(1),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
});

const linkStatusSchema = z.object({
  token: z.string().min(1),
});

router.get("/link-status", async (req, res, next) => {
  try {
    const parse = linkStatusSchema.safeParse(req.query);
    if (!parse.success || !verifyLinkToken(parse.data.token)) {
      res.status(200).json({ status: "inactive" });
      return;
    }

    const [link] = await db
      .select({ status: preparationLinksTable.status, createdAt: preparationLinksTable.createdAt })
      .from(preparationLinksTable)
      .where(eq(preparationLinksTable.token, parse.data.token))
      .limit(1);

    if (!link || link.status !== "active") {
      res.status(200).json({ status: "inactive" });
      return;
    }

    res.status(200).json({ status: isMagicLinkExpired(link) ? "expired" : "active" });
  } catch (err) {
    next(err);
  }
});

// POST /api/patient-auth/verify-dob
// Step 1: patient opens link token, submits DOB
router.post("/verify-dob", async (req, res, next) => {
  try {
    const parse = verifyDobSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid request", issues: parse.error.issues });
      return;
    }
    const { token, dateOfBirth } = parse.data;
    const ip = extractClientIp(req);

    if (!verifyLinkToken(token)) {
      res.status(404).json({ error: "Link not found or inactive", code: "LINK_INACTIVE" });
      return;
    }

    // Look up the link
    const [link] = await db
      .select()
      .from(preparationLinksTable)
      .where(eq(preparationLinksTable.token, token))
      .limit(1);

    if (!link || link.status !== "active") {
      await writeAuditLog({
        ctx: unauthAuditCtx(ip),
        action: AUDIT_ACTIONS.LINK_ACCESS,
        targetType: "preparation_link",
        outcome: "denied",
        context: { reason: link ? `link_status_${link.status}` : "link_not_found" },
      });
      res.status(404).json({ error: "Link not found or inactive", code: "LINK_INACTIVE" });
      return;
    }

    if (isMagicLinkExpired(link)) {
      res.status(410).json({ error: "Link expired", code: "LINK_EXPIRED" });
      return;
    }

    // Rate limit check
    if (isDobBlocked(link)) {
      await writeAuditLog({
        ctx: linkAuditCtx(link.id, ip),
        action: AUDIT_ACTIONS.LINK_DOB_BLOCKED,
        targetType: "preparation_link",
        targetId: link.id,
        outcome: "denied",
        context: { blockedUntil: link.dobBlockedUntil },
      });
      res.status(429).json({
        error: "Too many attempts. Please try again later.",
        code: "DOB_RATE_LIMITED",
        blockedUntil: link.dobBlockedUntil,
      });
      return;
    }

    // Fetch appointment + patient for DOB comparison
    const [appointment] = await db
      .select()
      .from(appointmentsTable)
      .where(eq(appointmentsTable.id, link.appointmentId))
      .limit(1);

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found", code: "APPOINTMENT_NOT_FOUND" });
      return;
    }

    // Get patient DOB — compare against invitation or linked patient record
    let expectedDob: string | null = null;
    let patientEmail: string | null = null;
    if (appointment.patientId) {
      const [patient] = await db
        .select({ dateOfBirth: patientsTable.dateOfBirth, email: patientsTable.email })
        .from(patientsTable)
        .where(eq(patientsTable.id, appointment.patientId))
        .limit(1);
      expectedDob = patient?.dateOfBirth ?? null;
      patientEmail = patient?.email ?? null;
    }
    // Fallback: DOB captured at invitation time (stored on patient record at creation)
    // If no patient yet matched, we can't verify — should not happen in normal flow

    if (!expectedDob) {
      res.status(500).json({ error: "Cannot verify identity — contact clinic", code: "DOB_UNAVAILABLE" });
      return;
    }

    const dobMatches = expectedDob === dateOfBirth;
    const newAttemptCount = link.dobAttemptCount + 1;
    const exceeded = newAttemptCount >= config.DOB_MAX_ATTEMPTS;

    if (!dobMatches) {
      await db.update(preparationLinksTable)
        .set({
          dobAttemptCount: newAttemptCount,
          ...(exceeded ? { dobBlockedUntil: blockUntil(config.DOB_BLOCK_MINUTES) } : {}),
        })
        .where(eq(preparationLinksTable.id, link.id));

      await writeAuditLog({
        ctx: linkAuditCtx(link.id, ip),
        action: AUDIT_ACTIONS.LINK_DOB_FAILED,
        targetType: "preparation_link",
        targetId: link.id,
        outcome: "failed",
        context: { attempts: newAttemptCount, blocked: exceeded },
      });

      if (exceeded) {
        res.status(429).json({ error: "Too many failed attempts. Please try again later.", code: "DOB_BLOCKED" });
      } else {
        res.status(401).json({
          error: "Invalid date of birth",
          code: "DOB_MISMATCH",
          attemptsRemaining: config.DOB_MAX_ATTEMPTS - newAttemptCount,
        });
      }
      return;
    }

    if (!patientEmail) {
      res.status(500).json({ error: "Email is not configured for this patient — contact clinic", code: "EMAIL_UNAVAILABLE" });
      return;
    }

    // DOB correct — reset attempt count, send OTP
    const otpCode = generateOtpCode();
    const otpHash = hashOtp(otpCode);
    const otpExpiresAt = new Date(Date.now() + config.OTP_EXPIRES_MINUTES * 60 * 1000);
    await db.update(preparationLinksTable)
      .set({
        dobAttemptCount: 0,
        dobBlockedUntil: null,
        otpCode: otpHash,
        otpExpiresAt,
        otpAttemptCount: 0,
        otpBlockedUntil: null,
        lastAccessedAt: new Date(),
      })
      .where(eq(preparationLinksTable.id, link.id));

    await sendVerificationCodeEmail(patientEmail, otpCode, "patient_access");

    await writeAuditLog({
      ctx: linkAuditCtx(link.id, ip),
      action: AUDIT_ACTIONS.LINK_DOB_SUCCESS,
      targetType: "preparation_link",
      targetId: link.id,
      outcome: "success",
    });
    await writeAuditLog({
      ctx: linkAuditCtx(link.id, ip),
      action: AUDIT_ACTIONS.LINK_OTP_SENT,
      targetType: "preparation_link",
      targetId: link.id,
      outcome: "success",
    });

    res.json({ otpSent: true, email: maskEmail(patientEmail) });
  } catch (err) {
    next(err);
  }
});

const verifyOtpSchema = z.object({
  token: z.string().min(1),
  otp: z.string().length(6),
});

// POST /api/patient-auth/verify-otp
// Step 2: patient submits OTP received via email
router.post("/verify-otp", async (req, res, next) => {
  try {
    const parse = verifyOtpSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid request", issues: parse.error.issues });
      return;
    }
    const { token, otp } = parse.data;
    const ip = extractClientIp(req);

    if (!verifyLinkToken(token)) {
      res.status(404).json({ error: "Link not found or inactive", code: "LINK_INACTIVE" });
      return;
    }

    const [link] = await db
      .select()
      .from(preparationLinksTable)
      .where(eq(preparationLinksTable.token, token))
      .limit(1);

    if (!link || link.status !== "active") {
      res.status(404).json({ error: "Link not found or inactive", code: "LINK_INACTIVE" });
      return;
    }

    if (isMagicLinkExpired(link)) {
      res.status(410).json({ error: "Link expired", code: "LINK_EXPIRED" });
      return;
    }

    if (isOtpBlocked(link)) {
      res.status(429).json({ error: "Too many attempts. Please try again later.", code: "OTP_RATE_LIMITED" });
      return;
    }

    if (!link.otpCode || !link.otpExpiresAt) {
      res.status(400).json({ error: "No active OTP. Please restart verification.", code: "NO_OTP" });
      return;
    }

    if (new Date(link.otpExpiresAt) < new Date()) {
      res.status(400).json({ error: "OTP expired. Please restart verification.", code: "OTP_EXPIRED" });
      return;
    }

    const otpValid = verifyOtp(otp, link.otpCode);
    const newAttemptCount = link.otpAttemptCount + 1;
    const exceeded = newAttemptCount >= config.OTP_MAX_ATTEMPTS;

    if (!otpValid) {
      await db.update(preparationLinksTable)
        .set({
          otpAttemptCount: newAttemptCount,
          ...(exceeded ? { otpBlockedUntil: blockUntil(config.OTP_BLOCK_MINUTES) } : {}),
        })
        .where(eq(preparationLinksTable.id, link.id));

      await writeAuditLog({
        ctx: linkAuditCtx(link.id, ip),
        action: AUDIT_ACTIONS.LINK_OTP_FAILED,
        targetType: "preparation_link",
        targetId: link.id,
        outcome: "failed",
        context: { attempts: newAttemptCount, blocked: exceeded },
      });

      if (exceeded) {
        res.status(429).json({ error: "Too many failed attempts. Please try again later.", code: "OTP_BLOCKED" });
      } else {
        res.status(401).json({
          error: "Invalid code",
          code: "OTP_MISMATCH",
          attemptsRemaining: config.OTP_MAX_ATTEMPTS - newAttemptCount,
        });
      }
      return;
    }

    // OTP valid — clear it, issue session
    await db.update(preparationLinksTable)
      .set({
        otpCode: null,
        otpExpiresAt: null,
        otpAttemptCount: 0,
        otpBlockedUntil: null,
        lastAccessedAt: new Date(),
      })
      .where(eq(preparationLinksTable.id, link.id));

    const patientToken = signPatientSession(link.id, link.appointmentId);

    await writeAuditLog({
      ctx: linkAuditCtx(link.id, ip),
      action: AUDIT_ACTIONS.LINK_OTP_SUCCESS,
      targetType: "preparation_link",
      targetId: link.id,
      outcome: "success",
    });

    res.json({ patientToken, appointmentId: link.appointmentId });
  } catch (err) {
    next(err);
  }
});
function maskEmail(email: string): string {
  const [localPart, domain] = email.split("@");
  if (!localPart || !domain) return "***";
  return `${localPart.slice(0, 1)}${"*".repeat(Math.max(2, localPart.length - 1))}@${domain}`;
}

export default router;
