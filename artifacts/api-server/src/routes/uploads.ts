/**
 * Document upload routes (patient-facing).
 * Lab results and ultrasound documents.
 * Access-restricted: patients upload their own; doctors view (in /doctor routes).
 * Every upload event is audit logged.
 *
 * Storage is selected by STORAGE_PROVIDER; stub is intended for local development.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { db, uploadedDocumentsTable, appointmentsTable, AUDIT_ACTIONS } from "../lib/db";
import { eq } from "drizzle-orm";
import { requirePatientAuth } from "../middlewares/authenticate";
import { writeAuditLog, linkAuditCtx } from "../services/audit";
import { extractClientIp } from "../middlewares/audit-middleware";
import { config } from "../lib/config";
import { ALLOWED_UPLOAD_MIME_TYPES } from "@workspace/db";
import crypto from "crypto";
import { saveDocument } from "../lib/document-storage";
import { z } from "zod";
import multer from "multer";

const router = Router();

const uploadMetaSchema = z.object({
  documentType: z.string().optional(),
  labStatus: z.enum([
    "uploaded_digitally",
    "will_bring_physical",
    "results_pending",
    "no_results_available",
    "not_required",
  ]).optional(),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_UPLOAD_SIZE_BYTES },
});

function uploadFile(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        error: "File too large",
        code: "FILE_TOO_LARGE",
        maxBytes: config.MAX_UPLOAD_SIZE_BYTES,
      });
      return;
    }
    next(err);
  });
}

/**
 * POST /api/uploads/:appointmentId
 * Patient uploads a lab/ultrasound document.
 *
 * The API receives the file and writes it through the configured storage adapter.
 */
router.post("/:appointmentId", requirePatientAuth, uploadFile, async (req, res, next) => {
  try {
    const { appointmentId } = req.params as Record<string, string>;
    const ip = extractClientIp(req);
    const linkId = req.patientSession!.sub;

    if (req.patientSession!.appointmentId !== appointmentId) {
      res.status(403).json({ error: "Forbidden" });
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

    if (!req.file) {
      res.status(400).json({ error: "A file is required", code: "FILE_REQUIRED" });
      return;
    }

    if (!ALLOWED_UPLOAD_MIME_TYPES.includes(req.file.mimetype as (typeof ALLOWED_UPLOAD_MIME_TYPES)[number])) {
      res.status(400).json({ error: "Unsupported file type", code: "UNSUPPORTED_FILE_TYPE" });
      return;
    }

    const parse = uploadMetaSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid request", issues: parse.error.issues });
      return;
    }
    const { documentType, labStatus } = parse.data;
    const { originalname: originalFileName, mimetype: mimeType, size: fileSizeBytes, buffer: fileBytes } = req.file;

    // Generate a storage key — opaque, non-guessable, not derived from patient data
    const storageKey = `appointments/${appointmentId}/docs/${crypto.randomBytes(24).toString("hex")}`;

    const [doc] = await db
      .insert(uploadedDocumentsTable)
      .values({
        appointmentId,
        originalFileName,
        mimeType,
        fileSizeBytes,
        storageKey,
        documentType: documentType ?? null,
      })
      .returning({
        id: uploadedDocumentsTable.id,
        originalFileName: uploadedDocumentsTable.originalFileName,
        mimeType: uploadedDocumentsTable.mimeType,
        fileSizeBytes: uploadedDocumentsTable.fileSizeBytes,
        documentType: uploadedDocumentsTable.documentType,
        uploadedAt: uploadedDocumentsTable.uploadedAt,
      });

    if (fileBytes) {
      await saveDocument(storageKey, fileBytes, mimeType);
    }

    // Persist lab status when provided (or default to uploaded_digitally when a file is added)
    await db
      .update(appointmentsTable)
      .set({
        labStatus: labStatus ?? "uploaded_digitally",
        updatedAt: new Date(),
      })
      .where(eq(appointmentsTable.id, appointmentId));

    await writeAuditLog({
      ctx: linkAuditCtx(linkId, ip),
      action: AUDIT_ACTIONS.DOCUMENT_UPLOAD,
      targetType: "document",
      targetId: doc.id,
      outcome: "success",
      context: { appointmentId, mimeType, fileSizeBytes, labStatus: labStatus ?? "uploaded_digitally" },
    });

    res.status(201).json({
      document: doc,
      // Phase 2: this will be a signed S3 PUT URL for the actual file upload
      uploadUrl: null,
      _note: config.STORAGE_PROVIDER === "s3" ? "File saved in S3 storage." : "File saved in stub storage.",
    });
  } catch (err) {
    next(err);
  }
});

const labStatusOnlySchema = z.object({
  labStatus: z.enum([
    "uploaded_digitally",
    "will_bring_physical",
    "results_pending",
    "no_results_available",
    "not_required",
  ]),
});

/**
 * PATCH /api/uploads/:appointmentId/lab-status
 * Patient declares lab status without uploading a file (never blocks submission).
 */
router.patch("/:appointmentId/lab-status", requirePatientAuth, async (req, res, next) => {
  try {
    const { appointmentId } = req.params as Record<string, string>;
    const ip = extractClientIp(req);
    const linkId = req.patientSession!.sub;

    if (req.patientSession!.appointmentId !== appointmentId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const parse = labStatusOnlySchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ error: "Invalid lab status", issues: parse.error.issues });
      return;
    }

    await db
      .update(appointmentsTable)
      .set({ labStatus: parse.data.labStatus, updatedAt: new Date() })
      .where(eq(appointmentsTable.id, appointmentId));

    await writeAuditLog({
      ctx: linkAuditCtx(linkId, ip),
      action: "lab_status.set",
      targetType: "appointment",
      targetId: appointmentId,
      outcome: "success",
      context: { labStatus: parse.data.labStatus },
    });

    res.json({ ok: true, labStatus: parse.data.labStatus });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/uploads/:appointmentId — list uploads for patient's own appointment
 */
router.get("/:appointmentId", requirePatientAuth, async (req, res, next) => {
  try {
    const { appointmentId } = req.params as Record<string, string>;

    if (req.patientSession!.appointmentId !== appointmentId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const docs = await db
      .select({
        id: uploadedDocumentsTable.id,
        originalFileName: uploadedDocumentsTable.originalFileName,
        mimeType: uploadedDocumentsTable.mimeType,
        fileSizeBytes: uploadedDocumentsTable.fileSizeBytes,
        documentType: uploadedDocumentsTable.documentType,
        uploadedAt: uploadedDocumentsTable.uploadedAt,
        ocrExtractedDate: uploadedDocumentsTable.ocrExtractedDate,
        // storageKey excluded
      })
      .from(uploadedDocumentsTable)
      .where(eq(uploadedDocumentsTable.appointmentId, appointmentId));

    res.json(docs);
  } catch (err) {
    next(err);
  }
});

export default router;
