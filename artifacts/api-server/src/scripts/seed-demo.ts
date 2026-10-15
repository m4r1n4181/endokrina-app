/**
 * Demo seed — fictional data for the public demo/portfolio environment.
 *
 * Creates:
 *   - 1 clinic admin + 1 doctor (credentials from env, MFA off so visitors can log in)
 *   - 6 fictional patients with appointments spread over the next days
 *   - submitted questionnaires (+ generated summaries) for most of them
 *   - lab / ultrasound result images uploaded to the configured document storage (S3)
 *   - one prior visit, so the doctor's patient history is not empty
 *
 * Everything goes through the same tables, storage adapter and summary generator the app uses,
 * so the doctor sees the data exactly as if patients had filled it in themselves.
 *
 * Required env (in addition to the normal API env: DATABASE_URL, MAGIC_LINK_SECRET, STORAGE_*, AWS_*, ...):
 *   DEMO_ADMIN_EMAIL, DEMO_ADMIN_PASSWORD, DEMO_DOCTOR_EMAIL, DEMO_DOCTOR_PASSWORD
 *
 * Run from the repository root:
 *   pnpm run db:seed:demo
 *
 * Refuses to run twice: if the demo doctor already exists, nothing is written.
 *
 * Reset (fresh dates, same fictional patients):
 *   pnpm run db:seed:demo -- --reset          (local, reads .env)
 *   scripts/reset-demo-prod.ps1                (production, reads env from Azure)
 * Deletes ONLY the six demo patients (matched by their fictional phone numbers) and their
 * appointments with the demo doctor — questionnaires, summaries, links and uploaded files —
 * then inserts them again relative to today. Staff accounts, passwords and anything else
 * (e.g. invitations visitors created) are left untouched. Needs only DEMO_ADMIN_EMAIL and
 * DEMO_DOCTOR_EMAIL; the accounts must already exist.
 * Patients get no email address on purpose, so background jobs never email fictional people.
 */
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as argon2 from "argon2";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  patientsTable,
  appointmentsTable,
  preparationLinksTable,
  questionnairesTable,
  uploadedDocumentsTable,
  summariesTable,
} from "../lib/db";
import { config } from "../lib/config";
import { zonedMidnightUtc, clinicDay } from "../lib/clinic-time";
import { deleteDocument, saveDocument } from "../lib/document-storage";
import { generateLinkToken } from "../services/patient-auth";
import { generateSummaries } from "../services/summary";

const ASSETS_DIR = path.join(import.meta.dirname, "demo-assets");

function requireEnv(name: string, minLength = 1): string {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(`${name} must be set${minLength > 1 ? ` (at least ${minLength} characters)` : ""}`);
  }
  return value;
}

/** Clinic-local date (YYYY-MM-DD) `days` from today. */
function localDate(days: number): string {
  const today = clinicDay(new Date(), config.APP_TIMEZONE).date;
  const [y, m, d] = today.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** UTC instant for a clinic-local wall-clock time `days` from today. */
function at(days: number, hour: number, minute = 0): Date {
  const midnight = zonedMidnightUtc(localDate(days), config.APP_TIMEZONE);
  return new Date(midnight.getTime() + (hour * 60 + minute) * 60_000);
}

function hashPassword(password: string) {
  return argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
}

type Answers = Record<string, unknown>;

interface DemoDocument {
  file: string;
  documentType: "lab_result" | "report";
  originalFileName: string;
}

interface DemoVisit {
  scheduledAt: Date;
  appointmentType: "initial_consultation" | "follow_up" | "ultrasound" | "post_op";
  appointmentStatus: "link_sent" | "in_progress" | "submitted" | "locked";
  labStatus: string | null;
  questionnaire?: { status: "in_progress" | "submitted" | "locked"; answers: Answers; savedDaysAgo: number };
  documents?: DemoDocument[];
}

interface DemoPatient {
  fullName: string;
  phone: string;
  dateOfBirth: string;
  sex: "male" | "female";
  visits: DemoVisit[];
}

function buildPatients(): DemoPatient[] {
  return [
    {
      fullName: "Jelena Marković",
      phone: "+381600000101",
      dateOfBirth: "1984-06-12",
      sex: "female",
      visits: [
        {
          scheduledAt: at(-118, 10, 0),
          appointmentType: "initial_consultation",
          appointmentStatus: "locked",
          labStatus: "uploaded_digitally",
          questionnaire: {
            status: "locked",
            savedDaysAgo: 120,
            answers: {
              full_name: "Jelena Marković",
              date_of_birth: "1984-06-12",
              sex: "female",
              symptoms: "Umor već nekoliko meseci, pospanost, suva koža i opadanje kose. Dobila sam oko 4 kg bez promene ishrane.",
              has_thyroid_diagnosis: false,
              has_ultrasound: false,
              current_thyroid_therapy: [],
              other_medications: [],
              cardiac_symptoms: false,
              musculoskeletal_symptoms: true,
              has_allergies: false,
              smoking: "non_smoker",
              alcohol: "occasional",
              other_conditions: "",
              surgical_history: "",
              has_family_history: true,
              family_history_details: "Majka — hipotireoza (Hashimoto)",
            },
          },
          documents: [
            { file: "jelena-markovic-lab-2026-06.png", documentType: "lab_result", originalFileName: "Nalaz_TSH_jun.png" },
          ],
        },
        {
          scheduledAt: at(1, 9, 0),
          appointmentType: "follow_up",
          appointmentStatus: "submitted",
          labStatus: "uploaded_digitally",
          questionnaire: {
            status: "submitted",
            savedDaysAgo: 2,
            answers: {
              full_name: "Jelena Marković",
              date_of_birth: "1984-06-12",
              sex: "female",
              symptoms: "Osećam se bolje nego pre terapije, ali je umor i dalje prisutan popodne. Kosa manje opada.",
              has_thyroid_diagnosis: true,
              diagnosis_history: "Hashimoto tireoiditis, dijagnoza postavljena u junu 2026.",
              has_ultrasound: true,
              ultrasound_findings: "Uradila UZ početkom oktobra — nalaz u prilogu.",
              current_thyroid_therapy: [{ name: "Euthyrox", dose: "75 mcg", frequency: "ujutru, natašte" }],
              other_medications: [{ name: "Vitamin D3", dose: "2000 IJ", frequency: "dnevno" }],
              cardiac_symptoms: false,
              musculoskeletal_symptoms: false,
              has_allergies: false,
              smoking: "non_smoker",
              alcohol: "occasional",
              has_family_history: true,
              family_history_details: "Majka — hipotireoza (Hashimoto)",
            },
          },
          documents: [
            { file: "jelena-markovic-lab-2026-10.png", documentType: "lab_result", originalFileName: "Nalaz_hormoni_oktobar.png" },
            { file: "jelena-markovic-uz-2026-10.png", documentType: "report", originalFileName: "UZ_stitaste_zlezde.png" },
          ],
        },
      ],
    },
    {
      fullName: "Ana Nikolić",
      phone: "+381600000102",
      dateOfBirth: "1992-11-21",
      sex: "female",
      visits: [
        {
          scheduledAt: at(1, 11, 30),
          appointmentType: "initial_consultation",
          appointmentStatus: "submitted",
          labStatus: "uploaded_digitally",
          questionnaire: {
            status: "submitted",
            savedDaysAgo: 1,
            answers: {
              full_name: "Ana Nikolić",
              date_of_birth: "1992-11-21",
              sex: "female",
              symptoms: "Lupanje srca, drhtanje ruku, nervoza i nesanica poslednjih mesec dana. Izgubila sam 5 kg, stalno mi je toplo.",
              has_thyroid_diagnosis: false,
              has_ultrasound: false,
              current_thyroid_therapy: [],
              other_medications: [],
              cardiac_symptoms: true,
              musculoskeletal_symptoms: false,
              has_allergies: true,
              allergies_list: "Penicilin",
              smoking: "smoker",
              alcohol: "occasional",
              has_family_history: false,
            },
          },
          documents: [
            { file: "ana-nikolic-lab-2026-10.png", documentType: "lab_result", originalFileName: "Nalaz_hormoni.png" },
          ],
        },
      ],
    },
    {
      fullName: "Milan Petrović",
      phone: "+381600000103",
      dateOfBirth: "1971-02-03",
      sex: "male",
      visits: [
        {
          scheduledAt: at(2, 10, 0),
          appointmentType: "ultrasound",
          appointmentStatus: "submitted",
          labStatus: "uploaded_digitally",
          questionnaire: {
            status: "submitted",
            savedDaysAgo: 3,
            answers: {
              full_name: "Milan Petrović",
              date_of_birth: "1971-02-03",
              sex: "male",
              symptoms: "Nemam tegobe, dolazim na redovnu kontrolu čvora.",
              has_thyroid_diagnosis: true,
              diagnosis_history: "Čvor u desnom režnju štitaste žlezde, otkriven 2024. godine.",
              has_ultrasound: true,
              ultrasound_findings: "Čvor oko 14 mm u desnom režnju, prethodno stabilan.",
              current_thyroid_therapy: [],
              other_medications: [{ name: "Amlodipin", dose: "5 mg", frequency: "jednom dnevno" }],
              cardiac_symptoms: false,
              musculoskeletal_symptoms: false,
              has_allergies: false,
              smoking: "ex_smoker",
              alcohol: "occasional",
              other_conditions: "Hipertenzija",
              has_family_history: true,
              family_history_details: "Otac — infarkt miokarda",
            },
          },
          documents: [
            { file: "milan-petrovic-lab-2026-09.png", documentType: "lab_result", originalFileName: "Hormoni_septembar.png" },
            { file: "milan-petrovic-uz-2026-09.png", documentType: "report", originalFileName: "UZ_cvor_desni_reznj.png" },
          ],
        },
      ],
    },
    {
      fullName: "Dragana Jovanović",
      phone: "+381600000104",
      dateOfBirth: "1965-08-30",
      sex: "female",
      visits: [
        {
          scheduledAt: at(3, 12, 0),
          appointmentType: "post_op",
          appointmentStatus: "submitted",
          labStatus: "uploaded_digitally",
          questionnaire: {
            status: "submitted",
            savedDaysAgo: 1,
            answers: {
              full_name: "Dragana Jovanović",
              date_of_birth: "1965-08-30",
              sex: "female",
              symptoms: "Dobro se osećam. Ponekad trnjenje u prstima.",
              has_thyroid_diagnosis: true,
              diagnosis_history: "Totalna tireoidektomija 2025. zbog multinodozne strume.",
              has_ultrasound: true,
              ultrasound_findings: "Posle operacije bez ostatnog tkiva.",
              current_thyroid_therapy: [{ name: "Euthyrox", dose: "100 mcg", frequency: "ujutru, natašte" }],
              other_medications: [{ name: "Kalcijum + vitamin D", dose: "500 mg", frequency: "dva puta dnevno" }],
              cardiac_symptoms: false,
              musculoskeletal_symptoms: true,
              has_allergies: false,
              smoking: "non_smoker",
              alcohol: "none",
              other_conditions: "Dijabetes tip 2",
              surgical_history: "Totalna tireoidektomija (2025)",
              has_family_history: true,
              family_history_details: "Sestra — dijabetes tip 2",
            },
          },
          documents: [
            { file: "dragana-jovanovic-lab-2026-10.png", documentType: "lab_result", originalFileName: "Kontrola_posle_operacije.png" },
          ],
        },
      ],
    },
    {
      fullName: "Stefan Ilić",
      phone: "+381600000105",
      dateOfBirth: "1988-04-15",
      sex: "male",
      visits: [
        {
          scheduledAt: at(4, 9, 30),
          appointmentType: "initial_consultation",
          appointmentStatus: "in_progress",
          labStatus: "results_pending",
          questionnaire: {
            status: "in_progress",
            savedDaysAgo: 0,
            answers: {
              full_name: "Stefan Ilić",
              date_of_birth: "1988-04-15",
              sex: "male",
              symptoms: "Primetio sam otok na prednjoj strani vrata.",
              has_thyroid_diagnosis: false,
            },
          },
        },
      ],
    },
    {
      fullName: "Marija Stojanović",
      phone: "+381600000106",
      dateOfBirth: "1979-01-09",
      sex: "female",
      visits: [
        {
          scheduledAt: at(6, 13, 0),
          appointmentType: "follow_up",
          appointmentStatus: "link_sent",
          labStatus: null,
        },
      ],
    },
  ];
}

async function upsertStaff(email: string, password: string, role: "clinic_admin" | "doctor", fullName: string) {
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing) return { id: existing.id, created: false };
  const [created] = await db
    .insert(usersTable)
    .values({ email, passwordHash: await hashPassword(password), role, fullName, mfaEnabled: false, isActive: true })
    .returning({ id: usersTable.id });
  return { id: created.id, created: true };
}

const RESET = process.argv.includes("--reset");

async function findUser(email: string) {
  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
  return user ?? null;
}

/** Removes the demo patients and everything hanging off their demo appointments. */
async function deleteDemoPatients(doctorId: string): Promise<void> {
  const phones = buildPatients().map((p) => p.phone);

  const appointments = await db
    .select({ id: appointmentsTable.id, patientId: appointmentsTable.patientId })
    .from(appointmentsTable)
    .where(and(eq(appointmentsTable.doctorId, doctorId), inArray(appointmentsTable.invitedPhone, phones)));
  const appointmentIds = appointments.map((a) => a.id);
  const patientIds = [...new Set(appointments.map((a) => a.patientId).filter((id): id is string => Boolean(id)))];

  const storageKeys = appointmentIds.length
    ? (
        await db
          .select({ storageKey: uploadedDocumentsTable.storageKey })
          .from(uploadedDocumentsTable)
          .where(inArray(uploadedDocumentsTable.appointmentId, appointmentIds))
      ).map((d) => d.storageKey)
    : [];

  await db.transaction(async (tx) => {
    if (appointmentIds.length) {
      await tx.delete(uploadedDocumentsTable).where(inArray(uploadedDocumentsTable.appointmentId, appointmentIds));
      await tx.delete(summariesTable).where(inArray(summariesTable.appointmentId, appointmentIds));
      await tx.delete(questionnairesTable).where(inArray(questionnairesTable.appointmentId, appointmentIds));
      await tx.delete(preparationLinksTable).where(inArray(preparationLinksTable.appointmentId, appointmentIds));
      await tx.delete(appointmentsTable).where(inArray(appointmentsTable.id, appointmentIds));
    }
    // A demo patient row goes only if nothing else still points at it.
    for (const patientId of patientIds) {
      const [stillUsed] = await tx
        .select({ id: appointmentsTable.id })
        .from(appointmentsTable)
        .where(eq(appointmentsTable.patientId, patientId))
        .limit(1);
      if (!stillUsed) await tx.delete(patientsTable).where(eq(patientsTable.id, patientId));
    }
  });

  let removedFiles = 0;
  for (const key of storageKeys) {
    try {
      await deleteDocument(key);
      removedFiles++;
    } catch (err) {
      console.warn(`Could not delete stored file ${key}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`Removed ${appointmentIds.length} demo appointments, ${patientIds.length} patients, ${removedFiles} stored files.`);
}

async function seed() {
  const adminEmail = requireEnv("DEMO_ADMIN_EMAIL").toLowerCase();
  const doctorEmail = requireEnv("DEMO_DOCTOR_EMAIL").toLowerCase();
  if (adminEmail === doctorEmail) throw new Error("DEMO_ADMIN_EMAIL and DEMO_DOCTOR_EMAIL must be different");

  let admin: { id: string };
  let doctor: { id: string };

  if (RESET) {
    const existingAdmin = await findUser(adminEmail);
    const existingDoctor = await findUser(doctorEmail);
    if (!existingAdmin || !existingDoctor) {
      throw new Error("--reset needs the demo admin and doctor to exist. Run the seed once without --reset first.");
    }
    admin = existingAdmin;
    doctor = existingDoctor;
    console.log(`Reset: refreshing demo patients for ${doctorEmail}`);
    console.log(`Storage: ${config.STORAGE_PROVIDER}${config.STORAGE_BUCKET ? ` (${config.STORAGE_BUCKET})` : ""}`);
    await deleteDemoPatients(doctor.id);
  } else {
    const adminPassword = requireEnv("DEMO_ADMIN_PASSWORD", 12);
    const doctorPassword = requireEnv("DEMO_DOCTOR_PASSWORD", 12);

    if (await findUser(doctorEmail)) {
      console.log(`Demo data already present (doctor ${doctorEmail} exists). Nothing to do. Use --reset for fresh dates.`);
      return;
    }

    console.log(`Storage: ${config.STORAGE_PROVIDER}${config.STORAGE_BUCKET ? ` (${config.STORAGE_BUCKET})` : ""}`);

    const createdAdmin = await upsertStaff(adminEmail, adminPassword, "clinic_admin", "Demo Administrator");
    const createdDoctor = await upsertStaff(doctorEmail, doctorPassword, "doctor", "dr Demo Endokrinolog");
    console.log(`Admin:  ${adminEmail} (${createdAdmin.created ? "created" : "already existed"})`);
    console.log(`Doctor: ${doctorEmail} (created)`);
    admin = createdAdmin;
    doctor = createdDoctor;
  }

  let documentCount = 0;
  const questionnaireAppointmentIds: string[] = [];
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000);

  for (const p of buildPatients()) {
    const [patient] = await db
      .insert(patientsTable)
      .values({
        fullName: p.fullName,
        email: null,
        phone: p.phone,
        dateOfBirth: p.dateOfBirth,
        sex: p.sex,
        consentGivenAt: daysAgo(130),
        consentVersion: "v1",
      })
      .returning({ id: patientsTable.id });

    for (const v of p.visits) {
      const [appointment] = await db
        .insert(appointmentsTable)
        .values({
          patientId: patient.id,
          doctorId: doctor.id,
          invitedFullName: p.fullName,
          invitedPhone: p.phone,
          appointmentType: v.appointmentType,
          scheduledAt: v.scheduledAt,
          status: v.appointmentStatus,
          labStatus: v.labStatus,
          createdByUserId: admin.id,
        })
        .returning({ id: appointmentsTable.id });

      const isPast = v.scheduledAt.getTime() < now;
      await db.insert(preparationLinksTable).values({
        appointmentId: appointment.id,
        token: generateLinkToken(),
        status: isPast ? "expired" : "active",
        lastAccessedAt: v.questionnaire ? daysAgo(v.questionnaire.savedDaysAgo) : null,
      });

      if (v.questionnaire) {
        const q = v.questionnaire;
        const savedAt = daysAgo(q.savedDaysAgo);
        await db.insert(questionnairesTable).values({
          appointmentId: appointment.id,
          schemaVersion: "thyroid_v1",
          answers: q.answers,
          status: q.status,
          consentGivenAt: savedAt,
          consentVersion: "v1",
          savedAt,
          submittedAt: q.status === "in_progress" ? null : savedAt,
          lockedAt: q.status === "locked" ? v.scheduledAt : null,
        });
        questionnaireAppointmentIds.push(appointment.id);
      }

      for (const doc of v.documents ?? []) {
        const bytes = await readFile(path.join(ASSETS_DIR, doc.file));
        const storageKey = `appointments/${appointment.id}/docs/${crypto.randomBytes(24).toString("hex")}`;
        await saveDocument(storageKey, bytes, "image/png");
        await db.insert(uploadedDocumentsTable).values({
          appointmentId: appointment.id,
          originalFileName: doc.originalFileName,
          detectedMime: "image/png",
          fileSizeBytes: bytes.length,
          storageKey,
          documentType: doc.documentType,
          uploadedAt: v.questionnaire ? daysAgo(v.questionnaire.savedDaysAgo) : new Date(),
        });
        documentCount++;
      }
    }
  }

  // Summaries are generated by the app's own template service, after all visits exist,
  // so the "with history" variant includes prior appointments.
  for (const appointmentId of questionnaireAppointmentIds) {
    await generateSummaries(appointmentId);
  }

  console.log(
    `Done: 6 patients, ${documentCount} documents uploaded, summaries generated for ${questionnaireAppointmentIds.length} appointments.`,
  );
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Demo seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  });
