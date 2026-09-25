import { pgTable, uuid, text, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { relations } from "drizzle-orm";
import { z } from "zod/v4";
import { appointmentsTable } from "./appointments";

export const linkStatusEnum = pgEnum("link_status", [
  "active",
  "deactivated", // manually cancelled or appointment cancelled
  "expired",     // past appointment date
]);

export const preparationLinksTable = pgTable("preparation_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  appointmentId: uuid("appointment_id").notNull().unique().references(() => appointmentsTable.id),
  // Cryptographically random signed token — never guessable
  token: text("token").notNull().unique(),
  status: linkStatusEnum("status").notNull().default("active"),
  // DOB verification rate-limiting (per spec)
  dobAttemptCount: integer("dob_attempt_count").notNull().default(0),
  dobBlockedUntil: timestamp("dob_blocked_until", { withTimezone: true }),
  // Email OTP (required per legal review — DOB-only insufficient for real health data)
  otpCode: text("otp_code"),           // hashed, null when no active OTP
  otpExpiresAt: timestamp("otp_expires_at", { withTimezone: true }),
  otpAttemptCount: integer("otp_attempt_count").notNull().default(0),
  otpBlockedUntil: timestamp("otp_blocked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
});

export const preparationLinkRelations = relations(preparationLinksTable, ({ one }) => ({
  appointment: one(appointmentsTable, {
    fields: [preparationLinksTable.appointmentId],
    references: [appointmentsTable.id],
  }),
}));

export const insertPreparationLinkSchema = createInsertSchema(preparationLinksTable).omit({
  id: true,
  createdAt: true,
  dobAttemptCount: true,
  otpAttemptCount: true,
});
export const selectPreparationLinkSchema = createSelectSchema(preparationLinksTable);

export type InsertPreparationLink = z.infer<typeof insertPreparationLinkSchema>;
export type PreparationLink = typeof preparationLinksTable.$inferSelect;
