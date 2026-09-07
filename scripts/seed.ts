/**
 * DEV-001 Thyroid Pre-Visit Platform — Development Seed Script
 *
 * Creates a minimal set of test data so you can walk through the full patient flow locally.
 *
 * Usage (after DB schema is pushed):
 *   pnpm --filter @workspace/db run seed
 *
 * What it creates:
 *   - 1 admin user     (admin@clinic.test / Admin1234!admin)
 *   - 1 doctor user    (dr.jovic@clinic.test / Doctor1234!doc)
 *   - 1 test patient   (Ana Petrović, DOB 1985-03-15, phone +381641234567)
 *   - 1 appointment    (tomorrow, 10:00)
 *   - 1 preparation link for that appointment
 *
 * Safe to re-run: all inserts use onConflictDoNothing on unique fields.
 */

// Load .env from repo root when running locally
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env") });

import * as argon2 from "argon2";
import { createHmac, randomBytes } from "crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { eq } from "drizzle-orm";
import * as schema from "../lib/db/src/schema/index.js";

const {
  usersTable,
  patientsTable,
  appointmentsTable,
  preparationLinksTable,
} = schema;

// ── DB connection ────────────────────────────────────────────────────────────

if (!process.env.DATABASE_URL) {
  console.error("❌  DATABASE_URL is not set. Copy .env.example → .env and fill in DATABASE_URL.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

// ── Helpers ──────────────────────────────────────────────────────────────────

async function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
}

function generateSignedLinkToken(): string {
  const secret = process.env.MAGIC_LINK_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("MAGIC_LINK_SECRET must be set and at least 32 characters long");
  }
  const payload = randomBytes(48).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function tomorrow10am() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d;
}

// ── Seed ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("🌱  Seeding development data…\n");

  // ── Admin user ─────────────────────────────────────────────────────────────
  const adminEmail = "admin@clinic.test";
  const adminPassword = "Admin1234!admin";
  const [existingAdmin] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, adminEmail))
    .limit(1);

  let adminId: string;
  if (existingAdmin) {
    adminId = existingAdmin.id;
    console.log(`  ✓  Admin already exists (${adminEmail})`);
  } else {
    const [admin] = await db
      .insert(usersTable)
      .values({
        email: adminEmail,
        passwordHash: await hashPassword(adminPassword),
        role: "clinic_admin",
        fullName: "Marta Nikolić (Admin)",
        mfaEnabled: false, // disabled for local dev convenience
      })
      .returning({ id: usersTable.id });
    adminId = admin!.id;
    console.log(`  ✓  Admin created:  ${adminEmail} / ${adminPassword}`);
  }

  // ── Doctor user ────────────────────────────────────────────────────────────
  const doctorEmail = "dr.jovic@clinic.test";
  const doctorPassword = "Doctor1234!doc";
  const [existingDoctor] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, doctorEmail))
    .limit(1);

  let doctorId: string;
  if (existingDoctor) {
    doctorId = existingDoctor.id;
    console.log(`  ✓  Doctor already exists (${doctorEmail})`);
  } else {
    const [doctor] = await db
      .insert(usersTable)
      .values({
        email: doctorEmail,
        passwordHash: await hashPassword(doctorPassword),
        role: "doctor",
        fullName: "Dr. Aleksandra Jović",
        mfaEnabled: false, // disabled for local dev convenience
      })
      .returning({ id: usersTable.id });
    doctorId = doctor!.id;
    console.log(`  ✓  Doctor created: ${doctorEmail} / ${doctorPassword}`);
  }

  // ── Patient ─────────────────────────────────────────────────────────────────
  const patientPhone = "+381641234567";
  const [existingPatient] = await db
    .select({ id: patientsTable.id })
    .from(patientsTable)
    .where(eq(patientsTable.phone, patientPhone))
    .limit(1);

  let patientId: string;
  if (existingPatient) {
    patientId = existingPatient.id;
    console.log(`  ✓  Patient already exists (${patientPhone})`);
  } else {
    const [patient] = await db
      .insert(patientsTable)
      .values({
        fullName: "Ana Petrović",
        phone: patientPhone,
        dateOfBirth: "1985-03-15",
        sex: "female",
      })
      .returning({ id: patientsTable.id });
    patientId = patient!.id;
    console.log(`  ✓  Patient created: Ana Petrović | DOB: 1985-03-15 | phone: ${patientPhone}`);
  }

  // ── Appointment ─────────────────────────────────────────────────────────────
  const [existingAppt] = await db
    .select({ id: appointmentsTable.id })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.patientId, patientId))
    .limit(1);

  let appointmentId: string;
  if (existingAppt) {
    appointmentId = existingAppt.id;
    console.log(`  ✓  Appointment already exists (id: ${appointmentId})`);
  } else {
    const scheduledAt = tomorrow10am();
    const [appt] = await db
      .insert(appointmentsTable)
      .values({
        patientId,
        doctorId,
        invitedFullName: "Ana Petrović",
        invitedPhone: patientPhone,
        appointmentType: "follow_up",
        scheduledAt,
        status: "link_sent",
        createdByUserId: adminId,
      })
      .returning({ id: appointmentsTable.id });
    appointmentId = appt!.id;
    console.log(`  ✓  Appointment created: tomorrow 10:00 | id: ${appointmentId}`);
  }

  // ── Preparation link ────────────────────────────────────────────────────────
  const [existingLink] = await db
    .select({ id: preparationLinksTable.id, token: preparationLinksTable.token })
    .from(preparationLinksTable)
    .where(eq(preparationLinksTable.appointmentId, appointmentId))
    .limit(1);

  let token: string;
  if (existingLink) {
    token = existingLink.token;
    console.log(`  ✓  Preparation link already exists`);
  } else {
    token = generateSignedLinkToken();
    await db.insert(preparationLinksTable).values({
      appointmentId,
      token,
      status: "active",
    });
    console.log(`  ✓  Preparation link created`);
  }

  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:5000";

  console.log(`
────────────────────────────────────────────────────────────
 ✅  Seed complete. Test credentials:
────────────────────────────────────────────────────────────

 ADMIN LOGIN  (clinic_admin role — creates appointments)
   URL:       ${baseUrl}/api/auth/login
   Email:     admin@clinic.test
   Password:  Admin1234!admin

 DOCTOR LOGIN  (read-only clinical views)
   URL:       ${baseUrl}/api/auth/login
   Email:     dr.jovic@clinic.test
   Password:  Doctor1234!doc

 PATIENT FLOW  (magic link → DOB → SMS OTP)
   Magic link: ${baseUrl}/prepare/${token}
   DOB:        1985-03-15  (format: YYYY-MM-DD)
   OTP:        printed in the SERVER CONSOLE when you submit the DOB
               (SMS_PROVIDER=stub — OTP is never actually sent by SMS)

 HEALTHCHECK
   ${baseUrl}/api/healthz  →  {"status":"ok"}
────────────────────────────────────────────────────────────
`);

  await pool.end();
}

seed().catch((err) => {
  console.error("❌  Seed failed:", err);
  process.exit(1);
});
