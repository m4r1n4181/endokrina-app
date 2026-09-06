/**
 * Admin/staff management routes.
 * Create and manage staff user accounts (doctors, admins, nurses).
 *
 * NOTE: Role changes are audit logged (required by compliance).
 */
import { Router } from "express";
import { db, usersTable, AUDIT_ACTIONS } from "../lib/db";
import { eq, desc } from "drizzle-orm";
import { requireStaffAuth } from "../middlewares/authenticate";
import { staffOnly, requireRole } from "../middlewares/rbac";
import { writeAuditLog, userAuditCtx } from "../services/audit";
import { extractClientIp } from "../middlewares/audit-middleware";
import argon2 from "argon2";
import { z } from "zod";

const router = Router();

router.use(requireStaffAuth);

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12, "Password must be at least 12 characters"),
  role: z.enum(["doctor", "clinic_admin", "nurse"] as const),
  fullName: z.string().min(1),
  phone: z.string().optional(),
});

// POST /api/admin/users — create staff user (doctor or clinic_admin)
router.post("/users", requireRole("doctor", "clinic_admin"), async (req, res, next) => {
  try {
    const parse = createUserSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid request", issues: parse.error.issues });
      return;
    }
    const { email, password, role, fullName, phone } = parse.data;
    const ip = extractClientIp(req);
    const userId = req.user!.sub;

    const passwordHash = await argon2.hash(String(password), {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const [user] = await db
      .insert(usersTable)
      .values({ email: email.toLowerCase(), passwordHash, role, fullName, phone })
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        role: usersTable.role,
        fullName: usersTable.fullName,
        mfaEnabled: usersTable.mfaEnabled,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
      });

    await writeAuditLog({
      ctx: userAuditCtx(userId, req.user!.role, ip),
      action: AUDIT_ACTIONS.USER_CREATE,
      targetType: "user",
      targetId: user.id,
      outcome: "success",
      context: { role },
    });

    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users — list staff users (all staff — admin needs doctor list for invitations)
router.get("/users", staffOnly, async (req, res, next) => {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        role: usersTable.role,
        fullName: usersTable.fullName,
        isActive: usersTable.isActive,
        mfaEnabled: usersTable.mfaEnabled,
        createdAt: usersTable.createdAt,
        lastLoginAt: usersTable.lastLoginAt,
      })
      .from(usersTable);
    // OpenAPI: array of StaffUser
    res.json(users);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/audit-log — query audit log (doctor + clinic_admin for breach scoping)
router.get("/audit-log", requireRole("doctor", "clinic_admin"), async (req, res, next) => {
  try {
    const { limit = "100", offset = "0" } = req.query as { limit?: string; offset?: string };
    const { auditLogTable } = await import("../lib/db");

    const entries = await db
      .select()
      .from(auditLogTable)
      .orderBy(desc(auditLogTable.timestamp))
      .limit(Math.min(parseInt(limit), 500))
      .offset(parseInt(offset));

    // Shape for OpenAPI/client: flat array with UI-friendly aliases
    const mapped = entries.map((e) => ({
      id: e.id,
      actorType: e.actorType,
      actorId: e.actorUserId ?? e.actorLinkId,
      actorUserId: e.actorUserId,
      actorLinkId: e.actorLinkId,
      actorRole: e.actorRole,
      actorEmail: null as string | null,
      action: e.action,
      targetType: e.targetType,
      targetId: e.targetId,
      appointmentId: e.targetType === "appointment" ? e.targetId : (e.context as { appointmentId?: string } | null)?.appointmentId ?? null,
      patientId: e.targetType === "patient" ? e.targetId : null,
      outcome: e.outcome === "failed" ? "failure" : e.outcome,
      context: e.context,
      createdAt: e.timestamp,
      timestamp: e.timestamp,
    }));

    res.json(mapped);
  } catch (err) {
    next(err);
  }
});

export default router;
