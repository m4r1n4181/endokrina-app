/**
 * Doctor-specific clinical view routes.
 * All endpoints here are doctor-only (RBAC enforced server-side).
 * Every clinical content access is audit logged.
 */
import { Router, type Response } from "express";
import { db, summariesTable, uploadedDocumentsTable, appointmentsTable, questionnairesTable, patientsTable, AUDIT_ACTIONS } from "../lib/db";
import { eq, and, ne } from "drizzle-orm";
import { requireStaffAuth } from "../middlewares/authenticate";
import { clinicalContentGuard } from "../middlewares/rbac";
import { writeAuditLog, userAuditCtx } from "../services/audit";
import { extractClientIp } from "../middlewares/audit-middleware";
import { readDocument } from "../lib/document-storage";
import { createDocumentLinkToken, verifyDocumentLinkToken } from "../services/document-link";

const router = Router();

/** Sends a stored document with headers every browser accepts (names may contain č, ć, š, ž, đ). */
function sendDocument(
  res: Response,
  doc: { detectedMime: string; originalFileName: string },
  disposition: "inline" | "attachment",
  fileBytes: Buffer
): void {
  res.setHeader("Content-Type", doc.detectedMime);
  // Header values must be ASCII: a name like "Nalaz_štitasta.pdf" made setHeader throw (500).
  // ASCII fallback for old clients + RFC 5987 filename* with the real UTF-8 name.
  const asciiFileName = doc.originalFileName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  res.setHeader(
    "Content-Disposition",
    `${disposition}; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(doc.originalFileName)}`
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.send(fileBytes);
}

// GET /api/doctor/files/:token — open/download one document through a short-lived signed link.
// Registered BEFORE the auth middleware on purpose: the signed token (minted by the authenticated
// /download endpoint below) is the authorisation, because a plain link cannot carry a Bearer header.
router.get("/files/:token", async (req, res, next) => {
  try {
    const link = verifyDocumentLinkToken(String(req.params.token ?? ""));
    if (!link) {
      res.status(410).json({ error: "Link expired or invalid", code: "DOCUMENT_LINK_INVALID" });
      return;
    }
    const disposition = req.query.disposition === "inline" ? "inline" : "attachment";

    const [doc] = await db
      .select()
      .from(uploadedDocumentsTable)
      .where(and(eq(uploadedDocumentsTable.id, link.d), eq(uploadedDocumentsTable.appointmentId, link.a)))
      .limit(1);

    if (!doc || doc.deletedAt) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    const fileBytes = await readDocument(doc.storageKey);

    await writeAuditLog({
      ctx: userAuditCtx(link.u, link.r, extractClientIp(req)),
      action: AUDIT_ACTIONS.DOCUMENT_DOWNLOAD,
      targetType: "document",
      targetId: doc.id,
      outcome: "success",
      context: { disposition, via: "signed_link" },
    });

    sendDocument(res, doc, disposition, fileBytes);
  } catch (err) {
    next(err);
  }
});

// All other doctor routes require staff auth + doctor role
router.use(requireStaffAuth, clinicalContentGuard);

// GET /api/doctor/appointments/:id/summaries — view both summary variants
router.get("/appointments/:id/summaries", async (req, res, next) => {
  try {
    const { id } = req.params as Record<string, string>;
    const ip = extractClientIp(req);
    const userId = req.user!.sub;

    const summaries = await db
      .select()
      .from(summariesTable)
      .where(eq(summariesTable.appointmentId, id));

    await writeAuditLog({
      ctx: userAuditCtx(userId, req.user!.role, ip),
      action: AUDIT_ACTIONS.SUMMARY_VIEW,
      targetType: "summary",
      targetId: id,
      outcome: "success",
      context: { variantsFound: summaries.map((s) => s.variant) },
    });

    res.json({ summaries });
  } catch (err) {
    next(err);
  }
});

// GET /api/doctor/appointments/:id/documents — list uploaded documents
router.get("/appointments/:id/documents", async (req, res, next) => {
  try {
    const { id } = req.params as Record<string, string>;
    const ip = extractClientIp(req);
    const userId = req.user!.sub;

    const docs = await db
      .select({
        id: uploadedDocumentsTable.id,
        appointmentId: uploadedDocumentsTable.appointmentId,
        originalFileName: uploadedDocumentsTable.originalFileName,
        mimeType: uploadedDocumentsTable.detectedMime,
        fileSizeBytes: uploadedDocumentsTable.fileSizeBytes,
        documentType: uploadedDocumentsTable.documentType,
        uploadedAt: uploadedDocumentsTable.uploadedAt,
        ocrExtractedDate: uploadedDocumentsTable.ocrExtractedDate,
        // storageKey is intentionally excluded from this listing
      })
      .from(uploadedDocumentsTable)
      .where(
        and(
          eq(uploadedDocumentsTable.appointmentId, id),
          // Exclude soft-deleted documents
        )
      );

    await writeAuditLog({
      ctx: userAuditCtx(userId, req.user!.role, ip),
      action: AUDIT_ACTIONS.DOCUMENT_VIEW,
      targetType: "appointment",
      targetId: id,
      outcome: "success",
      context: { documentCount: docs.length },
    });

    res.json({ documents: docs });
  } catch (err) {
    next(err);
  }
});

// GET /api/doctor/appointments/:id/documents/:docId/download — get file URL
router.get("/appointments/:id/documents/:docId/download", async (req, res, next) => {
  try {
    const { id, docId } = req.params as Record<string, string>;
    const ip = extractClientIp(req);
    const userId = req.user!.sub;

    const [doc] = await db
      .select()
      .from(uploadedDocumentsTable)
      .where(
        and(
          eq(uploadedDocumentsTable.id, docId),
          eq(uploadedDocumentsTable.appointmentId, id)
        )
      )
      .limit(1);

    if (!doc || doc.deletedAt) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    await writeAuditLog({
      ctx: userAuditCtx(userId, req.user!.role, ip),
      action: AUDIT_ACTIONS.DOCUMENT_DOWNLOAD,
      targetType: "document",
      targetId: docId,
      outcome: "success",
    });

    const linkToken = createDocumentLinkToken({ d: doc.id, a: id, u: userId, r: req.user!.role });
    res.json({
      // Short-lived signed link: works as a plain URL on every browser, including iPhone.
      downloadUrl: `/api/doctor/files/${linkToken}`,
      fileName: doc.originalFileName,
      mimeType: doc.detectedMime,
      _note: "Append ?disposition=inline to view, ?disposition=attachment to download. Expires in 2 minutes.",
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/doctor/appointments/:id/documents/:docId/file — stream the stored file
router.get("/appointments/:id/documents/:docId/file", async (req, res, next) => {
  try {
    const { id, docId } = req.params as Record<string, string>;
    const disposition = req.query.disposition === "inline" ? "inline" : "attachment";
    const ip = extractClientIp(req);
    const userId = req.user!.sub;

    const [doc] = await db
      .select()
      .from(uploadedDocumentsTable)
      .where(
        and(
          eq(uploadedDocumentsTable.id, docId),
          eq(uploadedDocumentsTable.appointmentId, id)
        )
      )
      .limit(1);

    if (!doc || doc.deletedAt) {
      res.status(404).json({ error: "Document not found" });
      return;
    }

    const fileBytes = await readDocument(doc.storageKey);

    await writeAuditLog({
      ctx: userAuditCtx(userId, req.user!.role, ip),
      action: AUDIT_ACTIONS.DOCUMENT_DOWNLOAD,
      targetType: "document",
      targetId: docId,
      outcome: "success",
      context: { disposition },
    });

    sendDocument(res, doc, disposition, fileBytes);
  } catch (err) {
    next(err);
  }
});

// GET /api/doctor/patients/:patientId/history — historical timeline (doctor only)
router.get("/patients/:patientId/history", async (req, res, next) => {
  try {
    const { patientId } = req.params as Record<string, string>;
    const ip = extractClientIp(req);
    const userId = req.user!.sub;

    const [patient] = await db
      .select({
        id: patientsTable.id,
        fullName: patientsTable.fullName,
        dateOfBirth: patientsTable.dateOfBirth,
        sex: patientsTable.sex,
        phone: patientsTable.phone,
        createdAt: patientsTable.createdAt,
      })
      .from(patientsTable)
      .where(eq(patientsTable.id, patientId))
      .limit(1);

    if (!patient) {
      res.status(404).json({ error: "Patient not found" });
      return;
    }

    // Prior appointments (excluding cancelled by default — per spec)
    const priorAppointments = await db
      .select({
        id: appointmentsTable.id,
        appointmentType: appointmentsTable.appointmentType,
        scheduledAt: appointmentsTable.scheduledAt,
        status: appointmentsTable.status,
        labStatus: appointmentsTable.labStatus,
      })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.patientId, patientId),
          eq(appointmentsTable.excludedFromClinicalViews, false)
        )
      );

    await writeAuditLog({
      ctx: userAuditCtx(userId, req.user!.role, ip),
      action: "patient.history_view",
      targetType: "patient",
      targetId: patientId,
      outcome: "success",
      context: { appointmentCount: priorAppointments.length },
    });

    res.json({ patient, appointments: priorAppointments });
  } catch (err) {
    next(err);
  }
});

export default router;
