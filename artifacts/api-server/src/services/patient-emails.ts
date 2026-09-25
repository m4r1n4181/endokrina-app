/**
 * Renders the patient invitation email (magic link to questionnaire).
 *
 * Pure module: no config/db imports.
 */

import { formatClinicDate, formatClinicTime } from "../lib/clinic-time";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export interface PatientInviteInput {
  patientName: string;
  appointmentDate: Date;
  clinicName: string;
  link: string;
  linkExpiresAt: Date;
  timeZone: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export function renderPatientInviteEmail(input: PatientInviteInput): RenderedEmail {
  const { patientName, appointmentDate, clinicName, link, linkExpiresAt, timeZone } = input;

  const dateLabel = formatClinicDate(appointmentDate, timeZone);
  const timeLabel = formatClinicTime(appointmentDate, timeZone);

  const expiresLabel = formatClinicDate(linkExpiresAt, timeZone);

  const subject = `Vaš link za popunjavanje upitnika – ${clinicName}`;

  const text = [
    `Poštovani ${singleLine(patientName)},`,
    "",
    `Zakazani ste za pregled ${dateLabel} u ${timeLabel} u klinici ${clinicName}.`,
    "",
    "Molimo vas da popunite upitnik pre pregleda klikom na link ispod:",
    link,
    "",
    `Link važi do ${expiresLabel}.`,
    "",
    "Srdačan pozdrav,",
    `Tim ${clinicName}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="sr-Latn">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vaš link za upitnik</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#173f46;">
  <div style="width:100%;max-width:600px;margin:0 auto;padding:40px 24px;box-sizing:border-box;">
    
    <!-- Header -->
    <div style="padding-bottom:24px;border-bottom:2px solid #173f46;">
      <div style="margin:0 0 12px;color:#173f46;font-size:24px;line-height:1.3;font-weight:650;">
        Poštovani ${escapeHtml(singleLine(patientName))},
      </div>
      <div style="color:#526d73;font-size:16px;line-height:1.5;">
        Zakazani ste za pregled ${escapeHtml(dateLabel)} u ${escapeHtml(timeLabel)} u klinici ${escapeHtml(clinicName)}.
      </div>
    </div>

    <!-- CTA button -->
    <div style="padding:32px 0 24px;">
      <p style="margin:0 0 16px;color:#173f46;font-size:16px;line-height:1.5;">
        Molimo vas da popunite upitnik pre pregleda klikom na dugme ispod:
      </p>

      <a
        href="${escapeHtml(link)}"
        style="
          display:inline-block;
          padding:14px 28px;
          background:#087f73;
          color:#ffffff;
          font-size:16px;
          line-height:1.4;
          font-weight:650;
          text-decoration:none;
          border-radius:6px;
        "
      >
        Popuni upitnik
      </a>
    </div>

    <!-- Link expiry -->
    <div style="padding-top:16px;color:#6d8185;font-size:14px;line-height:1.6;">
      Link važi do ${escapeHtml(expiresLabel)}.
    </div>

    <!-- Footer -->
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e1e8e9;color:#829397;font-size:13px;line-height:1.5;">
      Srdačan pozdrav,<br />
      Tim ${escapeHtml(clinicName)}
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}