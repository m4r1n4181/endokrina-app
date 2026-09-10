/**
 * Staff authentication routes (doctor / clinic_admin / nurse).
 * Patient access is handled separately via /api/patient-auth routes.
 */
import { Router } from "express";
import { db, usersTable, AUDIT_ACTIONS } from "../lib/db";
import { eq } from "drizzle-orm";
import { signStaffToken, signRefreshToken, verifyRefreshToken } from "../services/auth";
import { writeAuditLog, unauthAuditCtx, userAuditCtx } from "../services/audit";
import { requireStaffAuth } from "../middlewares/authenticate";
import { logger } from "../lib/logger";
import { extractClientIp } from "../middlewares/audit-middleware";
import { generateOtpCode, hashOtp, verifyOtp, blockUntil } from "../services/patient-auth";
import { sendSmsOtp } from "../services/sms";
import { config } from "../lib/config";
import argon2 from "argon2";
import { z } from "zod";
import rateLimit from "express-rate-limit";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaToken: z.string().optional(),
});
const mfaSettingsSchema = z.object({
  enabled: z.boolean(),
  phone: z.string().trim().min(6).optional(),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts, try again later", code: "RATE_LIMITED" },
});

// POST /api/auth/login
router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const parse = loginSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid request", issues: parse.error.issues });
      return;
    }
    const { email, password } = parse.data;
    const ip = extractClientIp(req);

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email.toLowerCase()))
      .limit(1);

    if (!user || !user.isActive) {
      await writeAuditLog({
        ctx: unauthAuditCtx(ip),
        action: AUDIT_ACTIONS.USER_LOGIN_FAILED,
        targetType: "user",
        outcome: "failed",
        context: { email, reason: "user_not_found_or_inactive" },
      });
      res.status(401).json({ error: "Invalid credentials", code: "INVALID_CREDENTIALS" });
      return;
    }

    const passwordValid = await argon2.verify(user.passwordHash, String(password));
    if (!passwordValid) {
      await writeAuditLog({
        ctx: unauthAuditCtx(ip),
        action: AUDIT_ACTIONS.USER_LOGIN_FAILED,
        targetType: "user",
        targetId: user.id,
        outcome: "failed",
        context: { reason: "invalid_password" },
      });
      res.status(401).json({ error: "Invalid credentials", code: "INVALID_CREDENTIALS" });
      return;
    }

    if (user.mfaEnabled) {
      const { mfaToken } = parse.data;
      if (!mfaToken) {
        if (!user.phone) {
          res.status(401).json({ error: "MFA phone number is not configured", code: "MFA_NOT_CONFIGURED" });
          return;
        }
        const otpCode = generateOtpCode();
        await db.update(usersTable).set({
          mfaOtpHash: hashOtp(otpCode),
          mfaOtpExpiresAt: new Date(Date.now() + config.OTP_EXPIRES_MINUTES * 60 * 1000),
          mfaOtpAttemptCount: 0,
          mfaOtpBlockedUntil: null,
        }).where(eq(usersTable.id, user.id));
        await sendSmsOtp(user.phone, otpCode);
        res.status(401).json({ error: "MFA token required", code: "MFA_REQUIRED" });
        return;
      }
      const blocked = user.mfaOtpBlockedUntil && new Date(user.mfaOtpBlockedUntil) > new Date();
      const expired = !user.mfaOtpHash || !user.mfaOtpExpiresAt || new Date(user.mfaOtpExpiresAt) <= new Date();
      let valid = false;
      if (!blocked && !expired) {
        try {
          valid = verifyOtp(mfaToken, user.mfaOtpHash!);
        } catch {
          valid = false;
        }
      }
      if (!valid) {
        const attempts = user.mfaOtpAttemptCount + 1;
        await db.update(usersTable).set({
          mfaOtpAttemptCount: attempts,
          ...(attempts >= config.OTP_MAX_ATTEMPTS ? { mfaOtpBlockedUntil: blockUntil(config.OTP_BLOCK_MINUTES) } : {}),
        }).where(eq(usersTable.id, user.id));
        res.status(401).json({ error: "Invalid MFA token", code: "INVALID_MFA" });
        return;
      }
      await db.update(usersTable).set({ mfaOtpHash: null, mfaOtpExpiresAt: null, mfaOtpAttemptCount: 0, mfaOtpBlockedUntil: null }).where(eq(usersTable.id, user.id));
    }

    // Update lastLoginAt
    await db
      .update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, user.id));

    const accessToken = signStaffToken(user);
    const refreshToken = signRefreshToken(user.id);

    await writeAuditLog({
      ctx: userAuditCtx(user.id, user.role, ip),
      action: AUDIT_ACTIONS.USER_LOGIN,
      targetType: "user",
      targetId: user.id,
      outcome: "success",
    });

    res.json({
      accessToken,
      refreshToken,
      requiresMfa: false,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        phone: user.phone ?? null,
        mfaEnabled: user.mfaEnabled,
        isActive: user.isActive,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/me/mfa", requireStaffAuth, async (req, res, next) => {
  try {
    const parse = mfaSettingsSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const [user] = await db
      .select({ phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.sub))
      .limit(1);
    const phone = parse.data.phone || user?.phone;
    if (parse.data.enabled && !phone) {
      res.status(400).json({ error: "Phone number is required for SMS MFA", code: "MFA_PHONE_REQUIRED" });
      return;
    }
    await db.update(usersTable).set({
      mfaEnabled: parse.data.enabled,
      ...(parse.data.phone ? { phone: parse.data.phone } : {}),
      updatedAt: new Date(),
    }).where(eq(usersTable.id, req.user!.sub));
    res.json({ mfaEnabled: parse.data.enabled });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post("/refresh", async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken?: string };
    if (!refreshToken) {
      res.status(400).json({ error: "Missing refreshToken" });
      return;
    }
    const { sub } = verifyRefreshToken(refreshToken);
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, sub))
      .limit(1);

    if (!user || !user.isActive) {
      res.status(401).json({ error: "Unauthorized", code: "INVALID_REFRESH" });
      return;
    }

    res.json({ accessToken: signStaffToken(user) });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post("/logout", requireStaffAuth, async (req, res, next) => {
  try {
    const ip = extractClientIp(req);
    await writeAuditLog({
      ctx: userAuditCtx(req.user!.sub, req.user!.role, ip),
      action: AUDIT_ACTIONS.USER_LOGOUT,
      targetType: "user",
      targetId: req.user!.sub,
      outcome: "success",
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get("/me", requireStaffAuth, async (req, res, next) => {
  try {
    const [user] = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        role: usersTable.role,
        fullName: usersTable.fullName,
        mfaEnabled: usersTable.mfaEnabled,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
        lastLoginAt: usersTable.lastLoginAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.sub))
      .limit(1);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
});

export default router;
