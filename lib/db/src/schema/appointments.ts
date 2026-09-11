import { pgTable, uuid, text, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod/v4";
import { patientsTable } from "./patients";
import { usersTable } from "./users";

export const appointmentStatusEnum = pgEnum("appointment_status", [
  "draft_invitation",   // created but link not sent yet
  "link_sent",          // magic link has been dispatched
  "opened",             // patient opened + verified identity
  "in_progress",        // questionnaire started
  "submitted",          // questionnaire submitted/saved with usable answers
  "locked",             // locked at appointment start time
  "reopened",           // manually reopened by staff/doctor after lock
  "rescheduled",        // appointment rescheduled (link still valid, data preserved)
  "cancelled",          // appointment cancelled (link deactivated, excluded from clinical views by default)
]);

export const appointmentsTable = pgTable("appointments", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Patient may be null until identity is matched/confirmed
  patientId: uuid("patient_id").references(() => patientsTable.id),
  doctorId: uuid("doctor_id").notNull().references(() => usersTable.id),
  // Identity fields captured at invitation time (may differ if patient is new)
  invitedFullName: text("invited_full_name").notNull(),
  invitedPhone: text("invited_phone").notNull(),
  // Appointment metadata
  appointmentType: text("appointment_type").notNull(), // e.g. "initial_consultation", "follow_up", "ultrasound"
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  status: appointmentStatusEnum("status").notNull().default("draft_invitation"),
  // Lab status — one of exactly five options per spec
  labStatus: text("lab_status"), // see LAB_STATUS_OPTIONS below
  // Soft-exclude flag for cancelled appointments (not hard-deleted — per legal decision)
  excludedFromClinicalViews: boolean("excluded_from_clinical_views").notNull().default(false),
  // Tracks rescheduling history (original time kept for audit)
  originalScheduledAt: timestamp("original_scheduled_at", { withTimezone: true }),
  // Doctor-facing measurement fields (F-13)
  consultationDurationMinutes: text("consultation_duration_minutes"),
  doctorDocumentationEffort: text("doctor_documentation_effort"), // simple field for self-report
  lastReminderSentAt: timestamp("last_reminder_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdByUserId: uuid("created_by_user_id").references(() => usersTable.id),
});

export const appointmentRelations = relations(appointmentsTable, ({ one }) => ({
  patient: one(patientsTable, {
    fields: [appointmentsTable.patientId],
    references: [patientsTable.id],
  }),
  doctor: one(usersTable, {
    fields: [appointmentsTable.doctorId],
    references: [usersTable.id],
  }),
}));

// Exactly the five lab status options from spec
export const LAB_STATUS_OPTIONS = [
  "uploaded_digitally",
  "will_bring_physical",
  "results_pending",
  "no_results_available",
  "not_required",
] as const;
export type LabStatus = (typeof LAB_STATUS_OPTIONS)[number];

export const insertAppointmentSchema = createInsertSchema(appointmentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectAppointmentSchema = createSelectSchema(appointmentsTable);

export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointmentsTable.$inferSelect;
