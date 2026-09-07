/**
 * Appointment routes — admin/reception manage invitations; doctor views.
 *
 * RBAC enforcement:
 *   - Create/edit/cancel/resend → clinic_admin, nurse
 *   - View operational status → all staff
 *   - View clinical content → doctor only (enforced in patient-detail routes)
 */
import express, { Router } from "express";
import { db, appointmentsTable, preparationLinksTable, patientsTable, AUDIT_ACTIONS } from "../lib/db";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { requireStaffAuth } from "../middlewares/authenticate";
import { staffOnly, adminOnly, doctorOnly } from "../middlewares/rbac";
import { writeAuditLog, userAuditCtx } from "../services/audit";
import { generateLinkToken } from "../services/patient-auth";
import { extractClientIp } from "../middlewares/audit-middleware";
import { config } from "../lib/config";
import { z } from "zod";

const router = Router();

// Parse JSON here as well so this route remains resilient even if the
// application-level middleware order changes in a bundled deployment.
router.use(express.json());

// All appointment routes require staff auth
router.use(requireStaffAuth);

const createAppointmentSchema = z.object({
  invitedFullName: z.string().min(1),
  invitedPhone: z.string().min(6),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  doctorId: z.string().uuid(),
  appointmentType: z.string().min(1),
  scheduledAt: z.string().min(1),
});

// POST /api/appointments — create invitation (admin/nurse only)
router.post("/", adminOnly, async (req, res, next) => {
  console.log("CT:", req.headers["content-type"], "BODY:", req.body);
  try {
    const parse = createAppointmentSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid request", issues: parse.error.issues });
      return;
    }
    const data = parse.data;
    const ip = extractClientIp(req);
    const userId = req.user!.sub;

    // Identity matching: check for existing patient by phone + DOB
    const [existingPatient] = await db
      .select()
      .from(patientsTable)
      .where(
        and(
          eq(patientsTable.phone, data.invitedPhone),
          eq(patientsTable.dateOfBirth, data.dateOfBirth)
        )
      )
      .limit(1);

    // Check for weak match (same phone, different DOB or vice versa) — warn but don't block
    let possibleDuplicate = false;
    if (!existingPatient) {
      const [phoneOnlyMatch] = await db
        .select({ id: patientsTable.id })
        .from(patientsTable)
        .where(eq(patientsTable.phone, data.invitedPhone))
        .limit(1);
      if (phoneOnlyMatch) possibleDuplicate = true;
    }

    // Create patient record if no exact match
    let patientId: string | null = existingPatient?.id ?? null;
    if (existingPatient && existingPatient.matchStatus !== "auto_linked") {
      await db
        .update(patientsTable)
        .set({ matchStatus: "auto_linked", updatedAt: new Date() })
        .where(eq(patientsTable.id, existingPatient.id));
    }

    if (!existingPatient) {
      const [newPatient] = await db
        .insert(patientsTable)
        .values({
          fullName: data.invitedFullName,
          phone: data.invitedPhone,
          dateOfBirth: data.dateOfBirth,
          matchStatus: possibleDuplicate ? "possible_duplicate" : "new_patient",
          duplicateReviewFlag: possibleDuplicate,
        })
        .returning();
      patientId = newPatient.id;

      await writeAuditLog({
        ctx: userAuditCtx(userId, req.user!.role, ip),
        action: AUDIT_ACTIONS.PATIENT_CREATE,
        targetType: "patient",
        targetId: newPatient.id,
        outcome: "success",
        context: { possibleDuplicate },
      });

      if (possibleDuplicate) {
        await writeAuditLog({
          ctx: userAuditCtx(userId, req.user!.role, ip),
          action: AUDIT_ACTIONS.PATIENT_MATCH_DUPLICATE,
          targetType: "patient",
          targetId: newPatient.id,
          outcome: "success",
        });
      }
    }

    // Create appointment
    const [appointment] = await db
      .insert(appointmentsTable)
      .values({
        patientId,
        doctorId: data.doctorId,
        invitedFullName: data.invitedFullName,
        invitedPhone: data.invitedPhone,
        appointmentType: data.appointmentType,
        scheduledAt: new Date(data.scheduledAt),
        status: "draft_invitation",
        createdByUserId: userId,
      })
      .returning();

    await writeAuditLog({
      ctx: userAuditCtx(userId, req.user!.role, ip),
      action: AUDIT_ACTIONS.APPOINTMENT_CREATE,
      targetType: "appointment",
      targetId: appointment.id,
      outcome: "success",
    });

    // Create preparation link
    const token = generateLinkToken();
    const [link] = await db
      .insert(preparationLinksTable)
      .values({ appointmentId: appointment.id, token })
      .returning();

    await writeAuditLog({
      ctx: userAuditCtx(userId, req.user!.role, ip),
      action: AUDIT_ACTIONS.LINK_SEND,
      targetType: "preparation_link",
      targetId: link.id,
      outcome: "success",
    });

    // Update appointment status to link_sent
    await db
      .update(appointmentsTable)
      .set({ status: "link_sent" })
      .where(eq(appointmentsTable.id, appointment.id));

    // TODO: dispatch message via configured channel (Viber/SMS/email)
    const linkUrl = `${config.PORTAL_BASE_URL}/prepare/${token}`;

    res.status(201).json({
      appointment: { ...appointment, status: "link_sent" },
      link: { id: link.id, url: linkUrl },
      possibleDuplicate,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/appointments — list appointments (all staff; doctor sees clinical extras)
router.get("/", staffOnly, async (req, res, next) => {
  try {
    const { date, doctorId } = req.query as { date?: string; doctorId?: string };

    // Build date range filter for a specific day
    let rows = await db
      .select({
        id: appointmentsTable.id,
        invitedFullName: appointmentsTable.invitedFullName,
        invitedPhone: appointmentsTable.invitedPhone,
        appointmentType: appointmentsTable.appointmentType,
        scheduledAt: appointmentsTable.scheduledAt,
        status: appointmentsTable.status,
        labStatus: appointmentsTable.labStatus,
        excludedFromClinicalViews: appointmentsTable.excludedFromClinicalViews,
        patientId: appointmentsTable.patientId,
        doctorId: appointmentsTable.doctorId,
        createdAt: appointmentsTable.createdAt,
        updatedAt: appointmentsTable.updatedAt,
      })
      .from(appointmentsTable)
      .where(
        and(
          // Exclude cancelled appointments from clinical views by default
          eq(appointmentsTable.excludedFromClinicalViews, false),
          doctorId ? eq(appointmentsTable.doctorId, doctorId) : undefined
        )
      )
      .orderBy(appointmentsTable.scheduledAt);

    // Filter by date if provided
    if (date) {
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(`${date}T23:59:59.999Z`);
      rows = rows.filter(
        (r) => r.scheduledAt >= dayStart && r.scheduledAt <= dayEnd
      );
    }

    // OpenAPI: array of Appointment
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/appointments/:id — operational status view (all staff)
// Doctors get clinical content; admin/reception get operational fields only
router.get("/:id", staffOnly, async (req, res, next) => {
  try {
    const { id } = req.params as Record<string, string>;
    const ip = extractClientIp(req);
    const userId = req.user!.sub;
    const role = req.user!.role;

    const [appointment] = await db
      .select()
      .from(appointmentsTable)
      .where(eq(appointmentsTable.id, id))
      .limit(1);

    if (!appointment) {
      res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
      return;
    }

    // Resolve attending doctor name (operational — safe for admin)
    const { usersTable, questionnairesTable } = await import("../lib/db");
    const [doctor] = appointment.doctorId
      ? await db
          .select({
            id: usersTable.id,
            fullName: usersTable.fullName,
            email: usersTable.email,
            role: usersTable.role,
          })
          .from(usersTable)
          .where(eq(usersTable.id, appointment.doctorId))
          .limit(1)
      : [undefined];

    // Admin/reception: operational fields only — no clinical content (answers/docs/summaries)
    if (role === "clinic_admin" || role === "nurse") {
      const [qMeta] = await db
        .select({
          id: questionnairesTable.id,
          status: questionnairesTable.status,
          consentGivenAt: questionnairesTable.consentGivenAt,
          savedAt: questionnairesTable.savedAt,
          submittedAt: questionnairesTable.submittedAt,
        })
        .from(questionnairesTable)
        .where(eq(questionnairesTable.appointmentId, id))
        .limit(1);

      res.json({
        id: appointment.id,
        patientId: appointment.patientId,
        doctorId: appointment.doctorId,
        invitedFullName: appointment.invitedFullName,
        invitedPhone: appointment.invitedPhone,
        appointmentType: appointment.appointmentType,
        scheduledAt: appointment.scheduledAt,
        status: appointment.status,
        labStatus: appointment.labStatus,
        excludedFromClinicalViews: appointment.excludedFromClinicalViews,
        createdAt: appointment.createdAt,
        updatedAt: appointment.updatedAt,
        doctor: doctor
          ? { id: doctor.id, fullName: doctor.fullName, email: doctor.email, role: doctor.role }
          : undefined,
        // Status timestamps only — never answers
        questionnaire: qMeta
          ? {
              id: qMeta.id,
              appointmentId: id,
              status: qMeta.status,
              consentGivenAt: qMeta.consentGivenAt,
              savedAt: qMeta.savedAt,
              submittedAt: qMeta.submittedAt,
              schemaVersion: "thyroid_v1",
              createdAt: appointment.createdAt,
            }
          : null,
      });
      return;
    }

    // Doctor: full appointment + questionnaire answers (audited)
    const [questionnaire] = await db
      .select()
      .from(questionnairesTable)
      .where(eq(questionnairesTable.appointmentId, id))
      .limit(1);

    await writeAuditLog({
      ctx: userAuditCtx(userId, role, ip),
      action: "appointment.view",
      targetType: "appointment",
      targetId: appointment.id,
      outcome: "success",
    });

    if (questionnaire) {
      await writeAuditLog({
        ctx: userAuditCtx(userId, role, ip),
        action: AUDIT_ACTIONS.QUESTIONNAIRE_VIEW,
        targetType: "questionnaire",
        targetId: questionnaire.id,
        outcome: "success",
        context: { appointmentId: id },
      });
    }

    res.json({
      ...appointment,
      doctor: doctor
        ? { id: doctor.id, fullName: doctor.fullName, email: doctor.email, role: doctor.role }
        : undefined,
      questionnaire: questionnaire ?? null,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/appointments/:id — edit date/time/type/phone (admin only, before lock)
router.patch("/:id", adminOnly, async (req, res, next) => {
  try {
    const { id } = req.params as Record<string, string>;
    const ip = extractClientIp(req);
    const userId = req.user!.sub;

    const [appointment] = await db
      .select()
      .from(appointmentsTable)
      .where(eq(appointmentsTable.id, id))
      .limit(1);

    if (!appointment) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    if (appointment.status === "locked" || appointment.status === "cancelled") {
      res.status(409).json({ error: "Cannot edit a locked or cancelled appointment", code: "APPOINTMENT_NOT_EDITABLE" });
      return;
    }

    const editSchema = z.object({
      scheduledAt: z.string().datetime({ offset: true }).optional(),
      appointmentType: z.string().min(1).optional(),
      invitedPhone: z.string().min(6).optional(),
      doctorId: z.string().uuid().optional(),
    });

    const parse = editSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid request", issues: parse.error.issues });
      return;
    }

    const isReschedule = !!parse.data.scheduledAt && parse.data.scheduledAt !== appointment.scheduledAt.toISOString();

    const [updated] = await db
      .update(appointmentsTable)
      .set({
        ...(parse.data.scheduledAt ? { scheduledAt: new Date(parse.data.scheduledAt) } : {}),
        ...(parse.data.appointmentType ? { appointmentType: parse.data.appointmentType } : {}),
        ...(parse.data.invitedPhone ? { invitedPhone: parse.data.invitedPhone } : {}),
        ...(parse.data.doctorId ? { doctorId: parse.data.doctorId } : {}),
        ...(isReschedule ? {
          status: "rescheduled",
          originalScheduledAt: appointment.scheduledAt,
        } : {}),
        updatedAt: new Date(),
      })
      .where(eq(appointmentsTable.id, id))
      .returning();

    await writeAuditLog({
      ctx: userAuditCtx(userId, req.user!.role, ip),
      action: isReschedule ? AUDIT_ACTIONS.APPOINTMENT_RESCHEDULE : AUDIT_ACTIONS.APPOINTMENT_EDIT,
      targetType: "appointment",
      targetId: id,
      outcome: "success",
      context: parse.data,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// POST /api/appointments/:id/cancel — cancel appointment (admin only)
router.post("/:id/cancel", adminOnly, async (req, res, next) => {
  try {
    const { id } = req.params as Record<string, string>;
    const ip = extractClientIp(req);
    const userId = req.user!.sub;

    const [appointment] = await db
      .select()
      .from(appointmentsTable)
      .where(eq(appointmentsTable.id, id))
      .limit(1);

    if (!appointment || appointment.status === "cancelled") {
      res.status(404).json({ error: "Not found or already cancelled" });
      return;
    }

    // Deactivate the preparation link
    await db
      .update(preparationLinksTable)
      .set({ status: "deactivated", deactivatedAt: new Date() })
      .where(eq(preparationLinksTable.appointmentId, id));

    // Soft-exclude from clinical views (data preserved for audit — per legal decision)
    await db
      .update(appointmentsTable)
      .set({ status: "cancelled", excludedFromClinicalViews: true, updatedAt: new Date() })
      .where(eq(appointmentsTable.id, id));

    await writeAuditLog({
      ctx: userAuditCtx(userId, req.user!.role, ip),
      action: AUDIT_ACTIONS.APPOINTMENT_CANCEL,
      targetType: "appointment",
      targetId: id,
      outcome: "success",
    });
    await writeAuditLog({
      ctx: userAuditCtx(userId, req.user!.role, ip),
      action: AUDIT_ACTIONS.LINK_DEACTIVATE,
      targetType: "preparation_link",
      outcome: "success",
      context: { appointmentId: id },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/appointments/:id/resend-link — resend preparation link (admin only)
router.post("/:id/resend-link", adminOnly, async (req, res, next) => {
  try {
    const { id } = req.params as Record<string, string>;
    const ip = extractClientIp(req);
    const userId = req.user!.sub;

    const [link] = await db
      .select()
      .from(preparationLinksTable)
      .where(eq(preparationLinksTable.appointmentId, id))
      .limit(1);

    if (!link || link.status !== "active") {
      res.status(404).json({ error: "No active link for this appointment", code: "NO_ACTIVE_LINK" });
      return;
    }

    // TODO: dispatch message via configured channel
    const linkUrl = `${config.PORTAL_BASE_URL}/prepare/${link.token}`;

    await writeAuditLog({
      ctx: userAuditCtx(userId, req.user!.role, ip),
      action: AUDIT_ACTIONS.LINK_RESEND,
      targetType: "preparation_link",
      targetId: link.id,
      outcome: "success",
    });

    res.json({ ok: true, linkUrl });
  } catch (err) {
    next(err);
  }
});

// POST /api/appointments/:id/reopen — reopen locked questionnaire (admin or doctor)
router.post("/:id/reopen", staffOnly, async (req, res, next) => {
  try {
    const { id } = req.params as Record<string, string>;
    const ip = extractClientIp(req);
    const userId = req.user!.sub;
    const role = req.user!.role;

    const [appointment] = await db
      .select()
      .from(appointmentsTable)
      .where(eq(appointmentsTable.id, id))
      .limit(1);

    if (!appointment) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    if (appointment.status !== "locked" && appointment.status !== "submitted") {
      res.status(409).json({ error: "Appointment is not in a state that can be reopened", code: "NOT_REOPENABLE" });
      return;
    }

    await db
      .update(appointmentsTable)
      .set({ status: "reopened", updatedAt: new Date() })
      .where(eq(appointmentsTable.id, id));

    await writeAuditLog({
      ctx: userAuditCtx(userId, role, ip),
      action: AUDIT_ACTIONS.QUESTIONNAIRE_REOPEN,
      targetType: "appointment",
      targetId: id,
      outcome: "success",
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
