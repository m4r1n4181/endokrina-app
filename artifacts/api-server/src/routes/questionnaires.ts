/**
 * Questionnaire routes.
 *
 * Patient routes (require patient session):
 *   GET  /api/questionnaires/:appointmentId        — load current questionnaire
 *   POST /api/questionnaires/:appointmentId/save   — save in progress
 *   POST /api/questionnaires/:appointmentId/submit — submit
 *   POST /api/questionnaires/:appointmentId/consent — record consent (before questionnaire opens)
 *
 * Doctor routes (require doctor role):
 *   GET  /api/questionnaires/:appointmentId/doctor — full clinical view (audited)
 *
 * All save/submit actions trigger summary regeneration.
 */
import { Router } from "express";
import {
  db, questionnairesTable, appointmentsTable, patientsTable, AUDIT_ACTIONS,
} from "../lib/db";
import { eq } from "drizzle-orm";
import { requirePatientAuth, requireStaffAuth } from "../middlewares/authenticate";
import { clinicalContentGuard } from "../middlewares/rbac";
import { writeAuditLog, linkAuditCtx, userAuditCtx } from "../services/audit";
import { generateSummaries } from "../services/summary";
import { extractClientIp } from "../middlewares/audit-middleware";
import {
  getAllowedQuestionIds,
  getQuestionnaireSchema,
  THYROID_QUESTIONNAIRE_V1,
} from "../lib/questionnaire-schema";
import { z } from "zod";

const router = Router();

// GET /api/questionnaires/schema — config-driven schema for patient UI (NFR-012)
router.get("/schema", (_req, res) => {
  res.json(THYROID_QUESTIONNAIRE_V1);
});

router.get("/schema/:version", (req, res) => {
  const schema = getQuestionnaireSchema(req.params.version as string);
  if (!schema) {
    res.status(404).json({ error: "Schema version not found" });
    return;
  }
  res.json(schema);
});

// Patient: record consent before questionnaire opens (required per compliance)
router.post("/:appointmentId/consent", requirePatientAuth, async (req, res, next) => {
  try {
    const { appointmentId } = req.params as Record<string, string>;
    const ip = extractClientIp(req);
    const linkId = req.patientSession!.sub;

    if (req.patientSession!.appointmentId !== appointmentId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const { consentVersion } = req.body as { consentVersion?: string };
    const now = new Date();

    // Upsert — questionnaire row may not exist yet at first consent
    await db
      .insert(questionnairesTable)
      .values({
        appointmentId,
        answers: {},
        status: "in_progress",
        consentGivenAt: now,
        consentVersion: consentVersion ?? "v1",
        schemaVersion: THYROID_QUESTIONNAIRE_V1.version,
      })
      .onConflictDoUpdate({
        target: questionnairesTable.appointmentId,
        set: {
          consentGivenAt: now,
          consentVersion: consentVersion ?? "v1",
          updatedAt: now,
        },
      });

    // Mark appointment opened after consent (don't downgrade later statuses)
    const [current] = await db
      .select({ status: appointmentsTable.status })
      .from(appointmentsTable)
      .where(eq(appointmentsTable.id, appointmentId))
      .limit(1);

    if (current && ["draft_invitation", "link_sent"].includes(current.status)) {
      await db
        .update(appointmentsTable)
        .set({ status: "opened", updatedAt: now })
        .where(eq(appointmentsTable.id, appointmentId));
    }

    await writeAuditLog({
      ctx: linkAuditCtx(linkId, ip),
      action: AUDIT_ACTIONS.CONSENT_GIVEN,
      targetType: "questionnaire",
      outcome: "success",
      context: { appointmentId, consentVersion },
    });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Patient: get current questionnaire state
router.get("/:appointmentId", requirePatientAuth, async (req, res, next) => {
  try {
    const { appointmentId } = req.params as Record<string, string>;

    if (req.patientSession!.appointmentId !== appointmentId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [questionnaire] = await db
      .select()
      .from(questionnairesTable)
      .where(eq(questionnairesTable.appointmentId, appointmentId))
      .limit(1);

    const [appointment] = await db
      .select({
        patientId: appointmentsTable.patientId,
        status: appointmentsTable.status,
        scheduledAt: appointmentsTable.scheduledAt,
        appointmentType: appointmentsTable.appointmentType,
      })
      .from(appointmentsTable)
      .where(eq(appointmentsTable.id, appointmentId))
      .limit(1);

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    const isLocked =
      appointment.status === "locked" ||
      (appointment.status !== "reopened" && new Date(appointment.scheduledAt) <= new Date());

    // Consent creates an empty questionnaire row, so check answers rather than
    // row existence before deciding whether stable profile fields can be used.
    let prefill: Record<string, unknown> | null = null;
    const questionnaireAnswers = questionnaire?.answers as Record<string, unknown> | undefined;
    const hasAnswers = questionnaireAnswers && Object.keys(questionnaireAnswers).length > 0;
    if (!hasAnswers && appointment.patientId) {
      const [patient] = await db
        .select({
          fullName: patientsTable.fullName,
          dateOfBirth: patientsTable.dateOfBirth,
          sex: patientsTable.sex,
          heightCm: patientsTable.heightCm,
          matchStatus: patientsTable.matchStatus,
        })
        .from(patientsTable)
        .where(eq(patientsTable.id, appointment.patientId))
        .limit(1);

      if (patient && patient.matchStatus === "auto_linked") {
        prefill = {
          full_name: patient.fullName,
          date_of_birth: patient.dateOfBirth,
          sex: patient.sex ?? undefined,
          height_cm: patient.heightCm ?? undefined,
        };
      }
    }

    res.json({
      questionnaire: questionnaire ?? null,
      prefill,
      isLocked,
      appointment: {
        status: appointment.status,
        scheduledAt: appointment.scheduledAt,
        appointmentType: appointment.appointmentType,
      },
    });
    
  } catch (err) {
    next(err);
  }
});

const answersSchema = z.record(z.string(), z.unknown());

// Patient: save questionnaire (can save and return until lock)
router.post("/:appointmentId/save", requirePatientAuth, async (req, res, next) => {
  try {
    const { appointmentId } = req.params as Record<string, string>;
    const ip = extractClientIp(req);
    const linkId = req.patientSession!.sub;

    if (req.patientSession!.appointmentId !== appointmentId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const parse = answersSchema.safeParse(req.body.answers);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid answers format" });
      return;
    }

    const allowedIds = getAllowedQuestionIds(THYROID_QUESTIONNAIRE_V1);
    const answers = parse.data;
    const unknownKeys = Object.keys(answers).filter((k) => !allowedIds.has(k));
    if (unknownKeys.length > 0) {
      res.status(400).json({ error: "Unknown questionnaire fields", code: "INVALID_FIELDS", fields: unknownKeys });
      return;
    }

    // Check lock state
    const [appointment] = await db
      .select({
        patientId: appointmentsTable.patientId,
        status: appointmentsTable.status,
        scheduledAt: appointmentsTable.scheduledAt,
      })
      .from(appointmentsTable)
      .where(eq(appointmentsTable.id, appointmentId))
      .limit(1);

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    const isLocked =
      appointment.status === "locked" ||
      (appointment.status !== "reopened" && new Date(appointment.scheduledAt) <= new Date());

    if (isLocked) {
      res.status(409).json({
        error: "Questionnaire is locked. Contact the clinic to reopen.",
        code: "QUESTIONNAIRE_LOCKED",
      });
      return;
    }

    const now = new Date();

    if (appointment.patientId) {
      const stableProfile: {
        fullName?: string;
        dateOfBirth?: string;
        sex?: "male" | "female" | "other" | "prefer_not_to_say";
        heightCm?: string;
      } = {};

      if (typeof parse.data.full_name === "string" && parse.data.full_name.trim()) {
        stableProfile.fullName = parse.data.full_name.trim();
      }
      if (typeof parse.data.date_of_birth === "string" && parse.data.date_of_birth) {
        stableProfile.dateOfBirth = parse.data.date_of_birth;
      }
      if (
        parse.data.sex === "male" ||
        parse.data.sex === "female" ||
        parse.data.sex === "other" ||
        parse.data.sex === "prefer_not_to_say"
      ) {
        stableProfile.sex = parse.data.sex;
      }
      if (typeof parse.data.height_cm === "string" && parse.data.height_cm.trim()) {
        stableProfile.heightCm = parse.data.height_cm.trim();
      }

      if (Object.keys(stableProfile).length > 0) {
        await db
          .update(patientsTable)
          .set({ ...stableProfile, updatedAt: now })
          .where(eq(patientsTable.id, appointment.patientId));
      }
    }

    // Upsert questionnaire
    const [questionnaire] = await db
      .insert(questionnairesTable)
      .values({
        appointmentId,
        answers: parse.data,
        status: "saved",
        savedAt: now,
      })
      .onConflictDoUpdate({
        target: questionnairesTable.appointmentId,
        set: {
          answers: parse.data,
          status: "saved",
          savedAt: now,
          updatedAt: now,
        },
      })
      .returning();

    // Update appointment status
    await db
      .update(appointmentsTable)
      .set({ status: "in_progress", updatedAt: now })
      .where(eq(appointmentsTable.id, appointmentId));

    await writeAuditLog({
      ctx: linkAuditCtx(linkId, ip),
      action: AUDIT_ACTIONS.QUESTIONNAIRE_SAVE,
      targetType: "questionnaire",
      targetId: questionnaire.id,
      outcome: "success",
    });

    // Trigger summary regeneration (async, non-blocking for response)
    generateSummaries(appointmentId).catch((err) => {
      // Log but don't fail the save
      import("../lib/logger").then(({ logger }) =>
        logger.error({ err, appointmentId }, "Summary generation failed after save")
      );
    });

    res.json({ ok: true, savedAt: now, questionnaireId: questionnaire.id });
  } catch (err) {
    next(err);
  }
});

// Patient: submit questionnaire
router.post("/:appointmentId/submit", requirePatientAuth, async (req, res, next) => {
  try {
    const { appointmentId } = req.params as Record<string, string>;
    const ip = extractClientIp(req);
    const linkId = req.patientSession!.sub;

    if (req.patientSession!.appointmentId !== appointmentId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const parse = answersSchema.safeParse(req.body.answers);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid answers format" });
      return;
    }

    const allowedIds = getAllowedQuestionIds(THYROID_QUESTIONNAIRE_V1);
    const unknownKeys = Object.keys(parse.data).filter((k) => !allowedIds.has(k));
    if (unknownKeys.length > 0) {
      res.status(400).json({ error: "Unknown questionnaire fields", code: "INVALID_FIELDS", fields: unknownKeys });
      return;
    }

    const [appointment] = await db
      .select({ status: appointmentsTable.status, scheduledAt: appointmentsTable.scheduledAt })
      .from(appointmentsTable)
      .where(eq(appointmentsTable.id, appointmentId))
      .limit(1);

    if (!appointment) {
      res.status(404).json({ error: "Appointment not found" });
      return;
    }

    const isLocked =
      appointment.status === "locked" ||
      (appointment.status !== "reopened" && new Date(appointment.scheduledAt) <= new Date());

    if (isLocked) {
      res.status(409).json({ error: "Questionnaire is locked", code: "QUESTIONNAIRE_LOCKED" });
      return;
    }

    const now = new Date();

    const [questionnaire] = await db
      .insert(questionnairesTable)
      .values({
        appointmentId,
        answers: parse.data,
        status: "submitted",
        savedAt: now,
        submittedAt: now,
      })
      .onConflictDoUpdate({
        target: questionnairesTable.appointmentId,
        set: {
          answers: parse.data,
          status: "submitted",
          savedAt: now,
          submittedAt: now,
          updatedAt: now,
        },
      })
      .returning();

    await db
      .update(appointmentsTable)
      .set({ status: "submitted", updatedAt: now })
      .where(eq(appointmentsTable.id, appointmentId));

    await writeAuditLog({
      ctx: linkAuditCtx(linkId, ip),
      action: AUDIT_ACTIONS.QUESTIONNAIRE_SUBMIT,
      targetType: "questionnaire",
      targetId: questionnaire.id,
      outcome: "success",
    });

    generateSummaries(appointmentId).catch((err) => {
      import("../lib/logger").then(({ logger }) =>
        logger.error({ err, appointmentId }, "Summary generation failed after submit")
      );
    });

    res.json({ ok: true, submittedAt: now });
  } catch (err) {
    next(err);
  }
});

// Doctor: view questionnaire clinical content (audited)
router.get("/:appointmentId/doctor", requireStaffAuth, clinicalContentGuard, async (req, res, next) => {
  try {
    const { appointmentId } = req.params as Record<string, string>;
    const ip = extractClientIp(req);
    const userId = req.user!.sub;

    const [questionnaire] = await db
      .select()
      .from(questionnairesTable)
      .where(eq(questionnairesTable.appointmentId, appointmentId))
      .limit(1);

    await writeAuditLog({
      ctx: userAuditCtx(userId, req.user!.role, ip),
      action: AUDIT_ACTIONS.QUESTIONNAIRE_VIEW,
      targetType: "questionnaire",
      targetId: questionnaire?.id,
      outcome: questionnaire ? "success" : "failed",
      context: { appointmentId },
    });

    if (!questionnaire) {
      res.status(404).json({ error: "Questionnaire not found" });
      return;
    }

    res.json(questionnaire);
  } catch (err) {
    next(err);
  }
});

export default router;
