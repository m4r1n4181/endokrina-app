import { pgTable, uuid, text, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const auditActorTypeEnum = pgEnum("audit_actor_type", [
  "user",               // authenticated staff/doctor user
  "patient_link",       // patient acting via preparation link
  "system",             // automated system action (e.g. auto-lock, reminder)
  "unauthenticated",    // failed access attempt
]);

export const auditOutcomeEnum = pgEnum("audit_outcome", [
  "success",
  "denied",    // 403 — actor present but not authorized
  "failed",    // attempt failed (wrong DOB/OTP, validation error, etc.)
  "error",     // unexpected server error
]);

/**
 * Audit log — retained indefinitely per legal requirement.
 * Every access to patient clinical content + every sensitive action must generate an entry.
 * This table is append-only: no updates, no deletes.
 * Must be queryable for breach scoping (regulatory obligation to "Poverenik").
 *
 * Sensitive actions that MUST be logged (at minimum):
 *   - Admin: create/edit/resend/cancel invitation
 *   - Patient: link access attempts (success + failed DOB/OTP)
 *   - Patient: questionnaire save/submit
 *   - Patient: document upload
 *   - Doctor: any view of clinical content (questionnaire, documents, summaries, history)
 *   - Staff/doctor: questionnaire reopen, cancellation, reschedule
 *   - Link: deactivation
 *   - Any role/access change
 */
export const auditLogTable = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Actor identity
  actorType: auditActorTypeEnum("actor_type").notNull(),
  actorUserId: uuid("actor_user_id"),        // null for patient_link or unauthenticated
  actorLinkId: uuid("actor_link_id"),        // null for user actors
  actorRole: text("actor_role"),             // role at time of action
  actorIp: text("actor_ip"),                 // for rate-limiting/breach investigations
  // Action
  action: text("action").notNull(),          // e.g. "questionnaire.save", "document.view", "link.dob_failed"
  // Target
  targetType: text("target_type"),           // e.g. "appointment", "questionnaire", "document", "summary"
  targetId: uuid("target_id"),
  // Outcome
  outcome: auditOutcomeEnum("outcome").notNull(),
  // Additional context (arbitrary JSON — may include status codes, search params, etc.)
  context: jsonb("context"),
  // Timestamp — indexed for time-range breach queries
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({
  id: true,
  timestamp: true,
});
export const selectAuditLogSchema = createSelectSchema(auditLogTable);

export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLogEntry = typeof auditLogTable.$inferSelect;

// Typed action constants — use these rather than raw strings to prevent typos
export const AUDIT_ACTIONS = {
  // Appointment / invitation
  APPOINTMENT_CREATE: "appointment.create",
  APPOINTMENT_EDIT: "appointment.edit",
  APPOINTMENT_CANCEL: "appointment.cancel",
  APPOINTMENT_RESCHEDULE: "appointment.reschedule",
  APPOINTMENT_REOPEN: "appointment.reopen",
  // Preparation link
  LINK_SEND: "link.send",
  LINK_RESEND: "link.resend",
  LINK_DEACTIVATE: "link.deactivate",
  LINK_ACCESS: "link.access",
  LINK_DOB_SUCCESS: "link.dob_success",
  LINK_DOB_FAILED: "link.dob_failed",
  LINK_DOB_BLOCKED: "link.dob_blocked",
  LINK_OTP_SENT: "link.otp_sent",
  LINK_OTP_SUCCESS: "link.otp_success",
  LINK_OTP_FAILED: "link.otp_failed",
  LINK_OTP_BLOCKED: "link.otp_blocked",
  // Consent
  CONSENT_GIVEN: "consent.given",
  // Questionnaire
  QUESTIONNAIRE_SAVE: "questionnaire.save",
  QUESTIONNAIRE_SUBMIT: "questionnaire.submit",
  QUESTIONNAIRE_LOCK: "questionnaire.lock",
  QUESTIONNAIRE_REOPEN: "questionnaire.reopen",
  QUESTIONNAIRE_VIEW: "questionnaire.view",          // doctor viewing
  // Documents
  DOCUMENT_UPLOAD: "document.upload",
  DOCUMENT_VIEW: "document.view",                    // doctor viewing
  DOCUMENT_DOWNLOAD: "document.download",            // doctor downloading
  DOCUMENT_DELETE: "document.delete",
  // Summaries
  SUMMARY_GENERATE: "summary.generate",
  SUMMARY_VIEW: "summary.view",                      // doctor viewing
  // Auth
  USER_LOGIN: "user.login",
  USER_LOGIN_FAILED: "user.login_failed",
  USER_LOGOUT: "user.logout",
  USER_MFA_SUCCESS: "user.mfa_success",
  USER_MFA_FAILED: "user.mfa_failed",
  USER_ROLE_CHANGE: "user.role_change",
  USER_CREATE: "user.create",
  USER_DEACTIVATE: "user.deactivate",
  // Patient
  PATIENT_CREATE: "patient.create",
  PATIENT_UPDATE: "patient.update",
  PATIENT_MATCH_DUPLICATE: "patient.match_duplicate",
  // Data subject rights (GDPR/Serbian law)
  DATA_ACCESS_REQUEST: "data.access_request",
  DATA_DELETION_REQUEST: "data.deletion_request",
  DATA_CORRECTION_REQUEST: "data.correction_request",
  DATA_EXPORT_REQUEST: "data.export_request",
  REMINDER_SEND: "reminder.send",
  MORNING_BRIEFING: "doctor.morning_briefing",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
