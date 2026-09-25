import { pgTable, uuid, text, date, timestamp, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const sexEnum = pgEnum("sex", ["male", "female", "other", "prefer_not_to_say"]);

export const patientMatchStatusEnum = pgEnum("patient_match_status", [
  "new_patient",
  "auto_linked",      // exact phone+DOB match
  "possible_duplicate", // weak match — needs staff review, never auto-merged
]);

export const patientsTable = pgTable("patients", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone").notNull(),
  dateOfBirth: date("date_of_birth").notNull(), // YYYY-MM-DD, used for identity verification
  sex: sexEnum("sex"),
  // Stable profile fields that may be prefilled in questionnaire
  additionalNotes: text("additional_notes"),
  // Duplicate-review flag — set when a weak match is found; never auto-merged
  matchStatus: patientMatchStatusEnum("match_status").notNull().default("new_patient"),
  duplicateReviewFlag: boolean("duplicate_review_flag").notNull().default(false),
  // Soft-delete / GDPR: excluded flag allows excluding from clinical views without hard-delete
  excludedFromClinicalViews: boolean("excluded_from_clinical_views").notNull().default(false),
  // Consent tracking
  consentGivenAt: timestamp("consent_given_at", { withTimezone: true }),
  consentVersion: text("consent_version"), // tracks which privacy-policy version was accepted
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPatientSchema = createInsertSchema(patientsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const selectPatientSchema = createSelectSchema(patientsTable);

export type InsertPatient = z.infer<typeof insertPatientSchema>;
export type Patient = typeof patientsTable.$inferSelect;
