import { pgTable, uuid, text, boolean, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Extensible role enum — nurse slot is included even though not fully scoped yet (per PRD)
export const userRoleEnum = pgEnum("user_role", [
  "doctor",
  "clinic_admin",
  "nurse",
]);

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  // SMS MFA is opt-in during the development phase.
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  mfaSecret: text("mfa_secret"), // TOTP secret (encrypted at application layer)
  mfaOtpHash: text("mfa_otp_hash"),
  mfaOtpExpiresAt: timestamp("mfa_otp_expires_at", { withTimezone: true }),
  mfaOtpAttemptCount: integer("mfa_otp_attempt_count").notNull().default(0),
  mfaOtpBlockedUntil: timestamp("mfa_otp_blocked_until", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  lastMorningBriefingOn: text("last_morning_briefing_on"), // YYYY-MM-DD in APP_TIMEZONE
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLoginAt: true,
});
export const selectUserSchema = createSelectSchema(usersTable).omit({
  passwordHash: true,
  mfaSecret: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type SafeUser = Omit<User, "passwordHash" | "mfaSecret">;
