/**
 * Outbound notifications for invitations, reminders, and doctor morning briefings.
 * SMS/email stay pluggable. Stub providers log to the API console for local/Stage 0.
 */
import nodemailer, { type Transporter } from "nodemailer";
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

export interface EmailContent {
  text: string;
  html?: string;
}

let smtpTransport: Transporter | null = null;

function getSmtpTransport(): Transporter {
  if (smtpTransport) return smtpTransport;
  if (!config.SMTP_HOST || !config.SMTP_PORT) {
    throw new Error("SMTP_HOST and SMTP_PORT are required when EMAIL_PROVIDER=smtp");
  }

  const implicitTls = config.SMTP_PORT === 465;
  smtpTransport = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    // 465 = implicit TLS; other ports upgrade via STARTTLS. In production TLS is mandatory so
    // patient names never travel over a plaintext hop; in dev, TLS-less sinks (Mailpit, MailHog)
    // still work.
    secure: implicitTls,
    requireTLS: !implicitTls && config.NODE_ENV === "production",
    auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS ?? "" } : undefined,
  });
  return smtpTransport;
}

/**
 * Sends an email through the configured provider.
 * Throws on delivery failure so callers can retry instead of assuming success.
 */
export async function sendEmail(to: string, subject: string, content: string | EmailContent): Promise<void> {
  const { text, html } = typeof content === "string" ? { text: content, html: undefined } : content;

  if (config.EMAIL_PROVIDER === "stub") {
    // Only the plain-text part is logged; stub mode is for dummy data only.
    logger.warn({ to, subject, body: text }, "[STUB EMAIL] Outbound message");
    return;
  }

  if (config.EMAIL_PROVIDER === "smtp") {
    await getSmtpTransport().sendMail({ from: config.EMAIL_FROM, to, subject, text, html });
    // Recipient and subject only — never log the body, it contains patient names.
    logger.info({ to, subject }, "Email sent via SMTP");
    return;
  }

  // Fail loudly rather than silently pretending the message was delivered.
  throw new Error(
    `EMAIL_PROVIDER=${config.EMAIL_PROVIDER} is not implemented. ` +
      "Use EMAIL_PROVIDER=smtp (Amazon SES is reachable through its SMTP interface).",
  );
}

export async function sendVerificationCodeEmail(
  to: string,
  code: string,
  purpose: "staff_login" | "patient_access",
): Promise<void> {
  const subject = purpose === "staff_login"
    ? "Kod za prijavu na portal klinike"
    : "Kod za pristup pripremi za pregled";
  const purposeText = purpose === "staff_login"
    ? "prijavu na portal klinike"
    : "pristup upitniku za pregled";
  const expiry = `${config.OTP_EXPIRES_MINUTES} minuta`;
  await sendEmail(to, subject, {
    text: `Vaš verifikacioni kod za ${purposeText} je: ${code}. Kod važi ${expiry}. Ako niste tražili ovaj kod, ignorišite ovu poruku.`,
    html: `<p>Vaš verifikacioni kod za ${purposeText} je:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>Kod važi ${expiry}. Ako niste tražili ovaj kod, ignorišite ovu poruku.</p>`,
  });
}
