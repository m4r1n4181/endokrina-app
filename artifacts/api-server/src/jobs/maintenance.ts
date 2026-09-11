import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
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

function clinicDateParts(now: Date, timeZone: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
  };
}

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

export async function sendDoctorMorningBriefings(now: Date = new Date()): Promise<number> {
  const { date, hour } = clinicDateParts(now, config.APP_TIMEZONE);
  if (hour < 6 || hour > 10) return 0;

  const doctors = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      fullName: usersTable.fullName,
      lastMorningBriefingOn: usersTable.lastMorningBriefingOn,
    })
    .from(usersTable)
    .where(and(eq(usersTable.role, "doctor"), eq(usersTable.isActive, true)));

  let sent = 0;
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);

  for (const doctor of doctors) {
    if (doctor.lastMorningBriefingOn === date) continue;

    const todays = await db
      .select({
        invitedFullName: appointmentsTable.invitedFullName,
        scheduledAt: appointmentsTable.scheduledAt,
        status: appointmentsTable.status,
        labStatus: appointmentsTable.labStatus,
      })
      .from(appointmentsTable)
      .where(
        and(
          eq(appointmentsTable.doctorId, doctor.id),
          eq(appointmentsTable.excludedFromClinicalViews, false),
          or(
            eq(appointmentsTable.status, "link_sent"),
            eq(appointmentsTable.status, "opened"),
            eq(appointmentsTable.status, "in_progress"),
            eq(appointmentsTable.status, "submitted"),
            eq(appointmentsTable.status, "locked"),
            eq(appointmentsTable.status, "reopened"),
            eq(appointmentsTable.status, "rescheduled"),
          ),
        ),
      );

    const forToday = todays.filter((row) => row.scheduledAt >= dayStart && row.scheduledAt <= dayEnd);
    const lines = forToday
      .map((row) => `- ${row.scheduledAt.toISOString()} ${row.invitedFullName} (${row.status}, nalazi: ${row.labStatus ?? "n/a"})`)
      .join("\n");
    const body = `Današnji pregledi:\n${lines || "(nema termina)"}\n\nDashboard: ${config.PORTAL_BASE_URL}/dashboard\n\nOvo nije EMR i email ne sadrži kliničke odgovore.`;

    await sendEmail(doctor.email, "Priprema za današnje preglede", body);
    await db
      .update(usersTable)
      .set({ lastMorningBriefingOn: date, updatedAt: now })
      .where(eq(usersTable.id, doctor.id));
    await writeAuditLog({
      ctx: systemAuditCtx(),
      action: AUDIT_ACTIONS.MORNING_BRIEFING,
      targetType: "user",
      targetId: doctor.id,
      outcome: "success",
      context: { date, appointmentCount: forToday.length },
    });
    sent += 1;
  }

  return sent;
}

export async function runMaintenanceJobs(now: Date = new Date()): Promise<void> {
  try {
    await lockAppointmentsDue(now);
    await sendDueReminders(now);
    await sendDoctorMorningBriefings(now);
  } catch (err) {
    logger.error({ err }, "Maintenance jobs failed");
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
