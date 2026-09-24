/**
 * Renders the doctor's morning briefing email.
 *
 * Content rules (per spec):
 *  - list of today's patients: name, appointment time, preparation status
 *  - NO clinical details (no questionnaire answers, no documents, no summaries)
 *  - one link to the doctor dashboard, where all details live behind login
 *
 * Pure module: no config/db imports, so it is trivially unit-testable.
 */
import { formatClinicDate, formatClinicTime } from "../lib/clinic-time";

// Keep in sync with STATUS_LABELS in clinic-portal/src/pages/staff/dashboard.tsx
export const STATUS_LABELS: Record<string, string> = {
  draft_invitation: "Nacrt",
  link_sent: "Link poslat",
  opened: "Otvoreno",
  in_progress: "U toku",
  submitted: "Poslato",
  locked: "Zaključano",
  reopened: "Ponovo otvoreno",
  rescheduled: "Pomereno",
  cancelled: "Otkazano",
};

export interface BriefingItem {
  patientName: string;
  scheduledAt: Date;
  status: string;
}

export interface BriefingInput {
  doctorName: string;
  /** Any instant within the briefing day; used only for the date label. */
  day: Date;
  items: BriefingItem[];
  dashboardUrl: string;
  timeZone: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strips CR/LF so no value can ever inject extra header lines. */
function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function renderMorningBriefing(input: BriefingInput): RenderedEmail {
  const { doctorName, day, items, dashboardUrl, timeZone } = input;

  const dateLabel = formatClinicDate(day, timeZone);
  const count = items.length;

  const subject = `Današnji pacijenti (${count}) – ${dateLabel}`;

  const rows = items.map((item) => ({
    time: formatClinicTime(item.scheduledAt, timeZone),
    name: singleLine(item.patientName),
    status: statusLabel(item.status),
  }));

  const textLines = rows.map(
    (r) => `${r.time}  ${r.name} — ${r.status}`,
  );

  const text = [
    `Dobro jutro, ${singleLine(doctorName)}.`,
    "",
    `Pacijenti zakazani za danas, ${dateLabel}`,
    "",
    ...textLines,
    "",
    `Detalje (upitnike, dokumente, sažetak i istoriju) vidite u portalu nakon prijave:`,
    dashboardUrl,
    "",
    "Ovaj mejl ne sadrži klinički sadržaj.",
  ].join("\n");

  const htmlRows = rows
    .map(
      (r) => `
        <tr>
          <td style="
            padding:16px 12px 16px 0;
            border-bottom:1px solid #e1e8e9;
            width:72px;
            white-space:nowrap;
            vertical-align:top;
            color:#173f46;
            font-size:16px;
            line-height:1.5;
            font-weight:600;
          ">
            ${escapeHtml(r.time)}
          </td>

          <td style="
            padding:16px 12px;
            border-bottom:1px solid #e1e8e9;
            vertical-align:top;
            color:#173f46;
            font-size:16px;
            line-height:1.5;
          ">
            ${escapeHtml(r.name)}
          </td>

          <td style="
            padding:16px 12px;
            border-bottom:1px solid #e1e8e9;
            vertical-align:top;
            color:#31575d;
            font-size:15px;
            line-height:1.5;
          ">
            ${escapeHtml(r.status)}
          </td>

        </tr>
      `,
    )
    .join("");

  const html = `<!doctype html>
<html lang="sr-Latn">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Današnji pacijenti</title>
</head>

<body style="
  margin:0;
  padding:0;
  background:#ffffff;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  color:#173f46;
">

  <div style="
    width:100%;
    max-width:720px;
    margin:0 auto;
    padding:44px 28px 48px;
    box-sizing:border-box;
  ">

    <!-- Header -->
    <div style="
      padding-bottom:28px;
      border-bottom:2px solid #173f46;
    ">

      <div style="
        margin:0 0 12px;
        color:#173f46;
        font-size:28px;
        line-height:1.25;
        font-weight:650;
        letter-spacing:-0.3px;
      ">
        Dobro jutro, ${escapeHtml(singleLine(doctorName))}.
      </div>

      <div style="
        color:#526d73;
        font-size:17px;
        line-height:1.5;
      ">
        Pacijenti zakazani za danas, ${escapeHtml(dateLabel)}
      </div>

    </div>

    <!-- Patient count -->
    <div style="
      padding:24px 0 18px;
      color:#526d73;
      font-size:16px;
      line-height:1.5;
    ">
      <strong style="
        color:#173f46;
        font-size:20px;
        font-weight:650;
      ">
        ${count}
      </strong>
      ${count === 1 ? "pacijent" : "pacijenata"}
    </div>

    <!-- Patient list -->
    <table
      role="presentation"
      cellpadding="0"
      cellspacing="0"
      style="
        width:100%;
        border-collapse:collapse;
        table-layout:auto;
      "
    >

      <thead>
        <tr>

          <th style="
            padding:0 12px 11px 0;
            text-align:left;
            border-bottom:2px solid #173f46;
            color:#526d73;
            font-size:13px;
            line-height:1.4;
            font-weight:650;
          ">
            Termin
          </th>

          <th style="
            padding:0 12px 11px;
            text-align:left;
            border-bottom:2px solid #173f46;
            color:#526d73;
            font-size:13px;
            line-height:1.4;
            font-weight:650;
          ">
            Pacijent
          </th>

          <th style="
            padding:0 12px 11px;
            text-align:left;
            border-bottom:2px solid #173f46;
            color:#526d73;
            font-size:13px;
            line-height:1.4;
            font-weight:650;
          ">
            Status
          </th>

        </tr>
      </thead>

      <tbody>
        ${htmlRows}
      </tbody>

    </table>

    <!-- Portal link -->
    <div style="
      padding:32px 0 0;
    ">

      <a
        href="${escapeHtml(dashboardUrl)}"
        style="
          color:#087f73;
          font-size:16px;
          line-height:1.5;
          font-weight:650;
          text-decoration:underline;
          text-decoration-thickness:1px;
          text-underline-offset:3px;
        "
      >
        Otvori pregled u portalu →
      </a>

    </div>

    <!-- Supporting text -->
    <div style="
      padding-top:16px;
      color:#6d8185;
      font-size:13px;
      line-height:1.6;
    ">
      Upitnike, dokumente, sažetak i istoriju možete pregledati
      nakon prijave.
    </div>

    <!-- Footer -->
    <div style="
      margin-top:40px;
      padding-top:16px;
      border-top:1px solid #e1e8e9;
      color:#829397;
      font-size:12px;
      line-height:1.5;
    ">
      Ovaj mejl ne sadrži klinički sadržaj.
    </div>

  </div>

</body>
</html>`;

  return { subject, text, html };
}
