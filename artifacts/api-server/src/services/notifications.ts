/**
 * Outbound notifications for invitations, reminders, and doctor morning briefings.
 * SMS/email stay pluggable. Stub providers log to the API console for local/Stage 0.
 */
import { config } from "../lib/config";
import { logger } from "../lib/logger";
import { sendSms } from "./sms";

export async function sendPatientLinkSms(toPhone: string, linkUrl: string): Promise<void> {
  await sendSms(toPhone, `Priprema za pregled: ${linkUrl}`);
}

export async function sendReminderSms(toPhone: string, linkUrl: string, scheduledAt: Date): Promise<void> {
  const when = scheduledAt.toISOString();
  await sendSms(toPhone, `Podsetnik za pregled (${when}). Priprema: ${linkUrl}`);
}

export async function sendEmail(to: string, subject: string, body: string): Promise<void> {
  if (config.EMAIL_PROVIDER === "stub") {
    logger.warn({ to, subject, body }, "[STUB EMAIL] Outbound message");
    return;
  }

  if (config.EMAIL_PROVIDER === "smtp") {
    if (!config.SMTP_HOST || !config.SMTP_PORT) {
      throw new Error("SMTP_HOST and SMTP_PORT are required when EMAIL_PROVIDER=smtp");
    }
    logger.info({ to, subject }, "SMTP email dispatch is configured; install nodemailer when activating production SMTP");
    return;
  }

  logger.info({ to, subject }, "SES dispatch is configured; wire @aws-sdk/client-ses when activating production email");
}
