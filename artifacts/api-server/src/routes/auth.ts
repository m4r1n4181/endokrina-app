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
import argon2 from "argon2";
import { z } from "zod";

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
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

    // TODO: MFA verification step — if mfaEnabled, require TOTP before issuing token
    // For Phase 1 foundation, MFA check is stubbed; Phase 2 will wire TOTP
    if (user.mfaEnabled) {
      const mfaToken = req.body.mfaToken as string | undefined;
      if (!mfaToken) {
        res.status(200).json({ requiresMfa: true, userId: user.id });
        return;
      }
      // TODO: verify TOTP mfaToken against user.mfaSecret
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
