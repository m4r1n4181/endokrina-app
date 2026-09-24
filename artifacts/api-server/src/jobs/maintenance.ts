import { and, asc, eq, gte, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";
import {
  appointmentsTable,
  db,
  preparationLinksTable,
  questionnairesTable,
  usersTable,
  AUDIT_ACTIONS,
} from "../lib/db";
import { config } from "../lib/config";
import { logger } from "../lib/logger";
import { systemAuditCtx, writeAuditLog } from "../services/audit";
import { sendEmail, sendReminderSms } from "../services/notifications";
import { clinicDay, type ClinicDay } from "../lib/clinic-time";
import { renderMorningBriefing, type BriefingItem } from "../services/briefing-email";

export async function lockAppointmentsDue(now: Date = new Date()): Promise<number> {
  const due = await db
    .select({
      id: appointmentsTable.id,
      status: appointmentsTable.status,
    })
    .from(appointmentsTable)
    .where(
      and(
        lte(appointmentsTable.scheduledAt, now),
        inArray(appointmentsTable.status, [
          "draft_invitation",
          "link_sent",
          "opened",
          "in_progress",
          "submitted",
          "rescheduled",
        ]),
      ),
    );

  for (const appointment of due) {
    await db
      .update(appointmentsTable)
      .set({ status: "locked", updatedAt: now })
      .where(eq(appointmentsTable.id, appointment.id));

    await db
      .update(questionnairesTable)
      .set({ status: "locked", lockedAt: now, updatedAt: now })
      .where(eq(questionnairesTable.appointmentId, appointment.id));

    await writeAuditLog({
      ctx: systemAuditCtx(),
      action: AUDIT_ACTIONS.QUESTIONNAIRE_LOCK,
      targetType: "appointment",
      targetId: appointment.id,
      outcome: "success",
    });
  }

  if (due.length > 0) {
    logger.info({ count: due.length }, "Auto-locked questionnaires at appointment time");
  }
  return due.length;
}

export async function sendDueReminders(now: Date = new Date()): Promise<number> {
  const windowStart = new Date(now.getTime() + (config.REMINDER_HOURS_BEFORE - 1) * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + config.REMINDER_HOURS_BEFORE * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: appointmentsTable.id,
      invitedPhone: appointmentsTable.invitedPhone,
      scheduledAt: appointmentsTable.scheduledAt,
      lastReminderSentAt: appointmentsTable.lastReminderSentAt,
      token: preparationLinksTable.token,
    })
    .from(appointmentsTable)
    .innerJoin(preparationLinksTable, eq(preparationLinksTable.appointmentId, appointmentsTable.id))
    .where(
      and(
        eq(preparationLinksTable.status, "active"),
        eq(appointmentsTable.excludedFromClinicalViews, false),
        inArray(appointmentsTable.status, ["link_sent", "opened", "in_progress", "rescheduled"]),
        isNull(appointmentsTable.lastReminderSentAt),
      ),
    );

  let sent = 0;
  for (const row of rows) {
    if (row.scheduledAt < windowStart || row.scheduledAt > windowEnd) continue;
    const linkUrl = `${config.PORTAL_BASE_URL}/prepare/${row.token}`;
    await sendReminderSms(row.invitedPhone, linkUrl, row.scheduledAt);
    await db
      .update(appointmentsTable)
      .set({ lastReminderSentAt: now, updatedAt: now })
      .where(eq(appointmentsTable.id, row.id));
    await writeAuditLog({
      ctx: systemAuditCtx(),
      action: AUDIT_ACTIONS.REMINDER_SEND,
      targetType: "appointment",
      targetId: row.id,
      outcome: "success",
    });
    sent += 1;
  }
  return sent;
}

/**
 * Appointment statuses that belong in the doctor's briefing.
 * Drafts (link never sent) and cancellations are left out.
 */
const BRIEFING_STATUSES = [
  "link_sent",
  "opened",
  "in_progress",
  "submitted",
  "locked",
  "reopened",
  "rescheduled",
] as const;

interface BriefingDoctor {
  id: string;
  email: string;
  fullName: string;
  lastMorningBriefingOn: string | null;
}

/**
 * Sends one email to a doctor with today's patient list.
 * Returns true if this call sent it, false if another job run already claimed the slot.
 */
async function sendBriefingToDoctor(
  doctor: BriefingDoctor,
  items: BriefingItem[],
  day: ClinicDay,
  now: Date,
): Promise<boolean> {
  // Claim the (doctor, day) slot atomically BEFORE sending. If two job runs (or two API
  // instances) overlap, only one wins this UPDATE, so nobody gets a duplicate mail.
  // Trade-off: a crash between claim and send means no mail that day (at-most-once),
  // which is preferable to duplicates for a daily digest.
  const claimed = await db
    .update(usersTable)
    .set({ lastMorningBriefingOn: day.date, updatedAt: now })
    .where(
      and(
        eq(usersTable.id, doctor.id),
        or(isNull(usersTable.lastMorningBriefingOn), ne(usersTable.lastMorningBriefingOn, day.date)),
      ),
    )
    .returning({ id: usersTable.id });
  if (claimed.length === 0) return false;

  const email = renderMorningBriefing({
    doctorName: doctor.fullName,
    day: now,
    items,
    dashboardUrl: `${config.PORTAL_BASE_URL.replace(/\/+$/, "")}/dashboard`,
    timeZone: config.APP_TIMEZONE,
  });

  try {
    await sendEmail(doctor.email, email.subject, { text: email.text, html: email.html });
  } catch (err) {
    // Release the claim so the next job tick retries. Not written to the append-only audit log:
    // during an SMTP outage that would add one row per doctor per minute.
    await db
      .update(usersTable)
      .set({ lastMorningBriefingOn: doctor.lastMorningBriefingOn, updatedAt: new Date() })
      .where(and(eq(usersTable.id, doctor.id), eq(usersTable.lastMorningBriefingOn, day.date)));
    throw err;
  }

  await writeAuditLog({
    ctx: systemAuditCtx(),
    action: AUDIT_ACTIONS.MORNING_BRIEFING,
    targetType: "user",
    targetId: doctor.id,
    outcome: "success",
    // Counts only. Never put patient names in the audit context.
    context: { date: day.date, appointmentCount: items.length },
  });
  return true;
}

/**
 * Morning email to each doctor listing today's patients (name, time, status).
 *  - at most one email per doctor per clinic-local day
 *  - only on days with at least one appointment
 *  - no clinical content; the link leads to the login-protected dashboard
 * Returns the number of emails sent.
 */
export async function sendDoctorMorningBriefings(now: Date = new Date()): Promise<number> {
  const day = clinicDay(now, config.APP_TIMEZONE);
  const windowStart = config.MORNING_BRIEFING_HOUR;
  const windowEnd = windowStart + config.MORNING_BRIEFING_CATCHUP_HOURS;
  if (day.hour < windowStart || day.hour >= windowEnd) return 0;

  // Active doctors who have not been briefed yet today.
  const doctors = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      fullName: usersTable.fullName,
      lastMorningBriefingOn: usersTable.lastMorningBriefingOn,
    })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.role, "doctor"),
        eq(usersTable.isActive, true),
        or(isNull(usersTable.lastMorningBriefingOn), ne(usersTable.lastMorningBriefingOn, day.date)),
      ),
    );
  if (doctors.length === 0) return 0;

  // One query for all of today's appointments, sorted by time. The day is a half-open
  // [start, end) interval in the clinic timezone, so DST days and late/early slots are handled.
  const todays = await db
    .select({
      doctorId: appointmentsTable.doctorId,
      patientName: appointmentsTable.invitedFullName,
      scheduledAt: appointmentsTable.scheduledAt,
      status: appointmentsTable.status,
    })
    .from(appointmentsTable)
    .where(
      and(
        inArray(appointmentsTable.doctorId, doctors.map((d) => d.id)),
        eq(appointmentsTable.excludedFromClinicalViews, false),
        inArray(appointmentsTable.status, [...BRIEFING_STATUSES]),
        gte(appointmentsTable.scheduledAt, day.startUtc),
        lt(appointmentsTable.scheduledAt, day.endUtc),
      ),
    )
    .orderBy(asc(appointmentsTable.scheduledAt));

  const byDoctor = new Map<string, BriefingItem[]>();
  for (const row of todays) {
    const list = byDoctor.get(row.doctorId) ?? [];
    list.push({
      patientName: row.patientName,
      scheduledAt: row.scheduledAt,
      status: row.status,
    });
    byDoctor.set(row.doctorId, list);
  }

  let sent = 0;
  for (const doctor of doctors) {
    const items = byDoctor.get(doctor.id);
    if (!items || items.length === 0) continue; // no appointments today, no email

    // One doctor's failure must not block the others.
    try {
      if (await sendBriefingToDoctor(doctor, items, day, now)) sent += 1;
    } catch (err) {
      logger.error({ err, doctorId: doctor.id }, "Morning briefing failed; will retry on the next job tick");
    }
  }

  return sent;
}

export async function runMaintenanceJobs(now: Date = new Date()): Promise<void> {
  const jobs = [
    ["Appointment locking", () => lockAppointmentsDue(now)],
    ["Due reminders", () => sendDueReminders(now)],
    ["Doctor morning briefings", () => sendDoctorMorningBriefings(now)],
  ] as const;

  for (const [name, run] of jobs) {
    try {
      await run();
    } catch (err) {
      logger.error({ err, job: name }, "Maintenance job failed");
    }
  }
}

let timer: NodeJS.Timeout | null = null;

export function startMaintenanceJobs(): void {
  if (!config.JOBS_ENABLED) {
    logger.info("Background jobs disabled");
    return;
  }
  const intervalMs = config.JOBS_INTERVAL_SECONDS * 1000;
  void runMaintenanceJobs();
  timer = setInterval(() => {
    void runMaintenanceJobs();
  }, intervalMs);
  logger.info({ intervalMs }, "Background jobs started (lock, reminders, morning briefing)");
}

export function stopMaintenanceJobs(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
