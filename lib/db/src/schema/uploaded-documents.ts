import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod/v4";
import { appointmentsTable } from "./appointments";

// Allowed upload formats per spec
export const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export const uploadedDocumentsTable = pgTable("uploaded_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id").notNull().references(() => appointmentsTable.id),
  // File metadata
  originalFileName: text("original_filename").notNull(),
  detectedMime: text("mime_type").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  // Encrypted object storage key (S3-style, server-side encrypted)
  // Never expose this key directly — it is an internal reference only
  storageKey: text("storage_key").notNull().unique(),
  // OCR — advisory/transient only, used for freshness warning only (per compliance)
  // Never treated as clinical data, stored only while relevant for the visit
  ocrExtractedDate: text("ocr_extracted_date"), // ISO date string if extracted, null otherwise
  ocrProcessedAt: timestamp("ocr_processed_at", { withTimezone: true }),
  // Document label/type (e.g. "thyroid_panel", "ultrasound", "other")
  documentType: text("document_type"),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  // Soft-delete for retention policy management (company-configurable, not hardcoded)
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletionReason: text("deletion_reason"),
});

export const uploadedDocumentRelations = relations(uploadedDocumentsTable, ({ one }) => ({
  appointment: one(appointmentsTable, {
    fields: [uploadedDocumentsTable.appointmentId],
    references: [appointmentsTable.id],
  }),
}));

export const insertUploadedDocumentSchema = createInsertSchema(uploadedDocumentsTable).omit({
  id: true,
  uploadedAt: true,
});
export const selectUploadedDocumentSchema = createSelectSchema(uploadedDocumentsTable).omit({
  storageKey: true, // never returned directly in API responses
});

export type InsertUploadedDocument = z.infer<typeof insertUploadedDocumentSchema>;
export type UploadedDocument = typeof uploadedDocumentsTable.$inferSelect;
