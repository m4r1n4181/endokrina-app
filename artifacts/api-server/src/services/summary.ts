/**
 * Deterministic templated summary generation service.
 * Template-based, NOT LLM-generated. Serbian language, medical/Latin terminology.
 * Summaries regenerate on every questionnaire save/submit; only the latest is stored.
 *
 * Two variants:
 *   1. current_visit — concise, copy-paste-ready
 *   2. current_visit_plus_history — includes longitudinal context from prior visits
 *
 * IMPORTANT: Never auto-generate clinical interpretation, diagnosis, therapy recommendations.
 * Data is patient-reported — label it as such, never as verified clinical fact.
 */
import { db, questionnairesTable, summariesTable, appointmentsTable, AUDIT_ACTIONS } from "../lib/db";
import { eq, and, ne } from "drizzle-orm";
import { writeAuditLog, systemAuditCtx } from "./audit";

interface MedItem {
  name: string;
  dose: string;
  frequency: string;
}

interface NormalizedAnswers {
  symptoms?: string;
  diagnosisHistory?: string;
  ultrasoundHistory?: string;
  currentTherapy?: MedItem[];
  otherMedications?: MedItem[];
  additionalSymptoms?: string;
  allergies?: Array<{ type: string; allergen: string }>;
  lifestyleHabits?: { smoking?: string; alcohol?: string; other?: string };
  otherConditions?: string;
  surgicalHistory?: string;
  familyHistory?: string;
}

function asString(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "boolean") return v ? "da" : "ne";
  if (Array.isArray(v)) {
    const joined = v.map(String).filter(Boolean).join(", ");
    return joined || undefined;
  }
  return undefined;
}

function asMeds(v: unknown): MedItem[] | undefined {
  if (!Array.isArray(v) || v.length === 0) return undefined;
  return v
    .map((m) => {
      if (typeof m === "string") return { name: m, dose: "", frequency: "" };
      if (m && typeof m === "object") {
        const obj = m as Record<string, unknown>;
        return {
          name: String(obj.name ?? obj.medication ?? ""),
          dose: String(obj.dose ?? ""),
          frequency: String(obj.frequency ?? ""),
        };
      }
      return null;
    })
    .filter((m): m is MedItem => !!m && !!m.name);
}

/**
 * Normalize flat thyroid_v1 schema answers (and legacy nested shapes) into summary fields.
 */
function normalizeAnswers(raw: Record<string, unknown>): NormalizedAnswers {
  // Legacy nested section shape from earlier UI
  const nested = (section: string, key: string) => {
    const sec = raw[section];
    if (sec && typeof sec === "object" && !Array.isArray(sec)) {
      return (sec as Record<string, unknown>)[key];
    }
    return undefined;
  };

  const get = (...keys: string[]) => {
    for (const k of keys) {
      if (raw[k] !== undefined && raw[k] !== null && raw[k] !== "") return raw[k];
    }
    return undefined;
  };

  const symptoms =
    asString(get("symptoms")) ||
    asString(nested("main_complaint", "reason")) ||
    asString(nested("additional_symptoms", "symptoms"));

  const diagnosisHistory =
    asString(get("diagnosis_history", "diagnosisHistory")) ||
    asString(nested("thyroid_history", "diagnosis_details"));

  const ultrasoundHistory =
    asString(get("ultrasound_findings", "ultrasoundHistory")) ||
    (get("has_ultrasound") === true || get("has_ultrasound") === "true"
      ? "Pacijent navodi da je radio/la UZ štitaste žlezde"
      : undefined);

  const currentTherapy =
    asMeds(get("current_thyroid_therapy", "currentTherapy")) ||
    (asString(nested("current_therapy", "meds_details"))
      ? [{ name: asString(nested("current_therapy", "meds_details"))!, dose: "", frequency: "" }]
      : undefined);

  const otherMedications = asMeds(get("other_medications", "otherMedications"));

  const additionalParts: string[] = [];
  const cardiac = get("cardiac_symptoms");
  const musculo = get("musculoskeletal_symptoms");
  if (cardiac === true || cardiac === "true") {
    additionalParts.push("kardijalni simptomi (lupanje/preskakanje srca, gušenje, vrtoglavica ili sinkopa)");
  }
  if (musculo === true || musculo === "true") {
    additionalParts.push("bolovi u kostima, zglobovima ili mišićima");
  }
  const extra = asString(get("additionalSymptoms")) || asString(nested("additional_symptoms", "symptoms"));
  if (extra) additionalParts.push(extra);

  const allergyText =
    asString(get("allergies_list")) ||
    asString(nested("allergies", "allergy_details"));
  const hasAllergies = get("has_allergies") === true || get("has_allergies") === "true" || !!allergyText;

  const smokingLabel: Record<string, string> = {
    non_smoker: "Ne puši",
    smoker: "Puši",
    ex_smoker: "Bivši pušač",
    prefer_not_to_say: "Ne želi da navede",
    Da: "Puši",
    Ne: "Ne puši",
    "Bivši pušač": "Bivši pušač",
  };
  const alcoholLabel: Record<string, string> = {
    none: "Ne konzumira",
    occasional: "Povremeno",
    regular: "Redovno",
    prefer_not_to_say: "Ne želi da navede",
  };

  const smokingRaw = asString(get("smoking")) || asString(nested("lifestyle", "smoking"));
  const alcoholRaw = asString(get("alcohol")) || asString(nested("lifestyle", "alcohol"));

  return {
    symptoms,
    diagnosisHistory,
    ultrasoundHistory,
    currentTherapy,
    otherMedications,
    additionalSymptoms: additionalParts.length ? additionalParts.join("; ") : undefined,
    allergies: hasAllergies
      ? [{ type: "navedeno od pacijenta", allergen: allergyText || "nije precizirano" }]
      : get("has_allergies") === false || get("has_allergies") === "false"
        ? []
        : undefined,
    lifestyleHabits: {
      smoking: smokingRaw ? (smokingLabel[smokingRaw] ?? smokingRaw) : undefined,
      alcohol: alcoholRaw ? (alcoholLabel[alcoholRaw] ?? alcoholRaw) : undefined,
    },
    otherConditions:
      asString(get("other_conditions", "otherConditions")) ||
      asString(nested("medical_history", "other_conditions")),
    surgicalHistory:
      asString(get("surgical_history", "surgicalHistory")) ||
      (nested("thyroid_history", "surgery") === true ? "Operacija štitaste žlezde (navodi pacijent)" : undefined),
    familyHistory:
      asString(get("family_history_details", "familyHistory")) ||
      (get("has_family_history") === true || nested("medical_history", "family_history") === true
        ? "Pozitivna porodična anamneza (detalji nisu navedeni)"
        : undefined),
  };
}

function formatMedications(meds?: MedItem[]): string {
  if (!meds || meds.length === 0) return "– navodi da ne uzima lekove / nije navedeno";
  return meds.map((m) => [m.name, m.dose, m.frequency].filter(Boolean).join(" ")).join(", ");
}

function formatAllergies(allergies?: Array<{ type: string; allergen: string }>): string {
  if (!allergies) return "– nije navedeno";
  if (allergies.length === 0) return "– navodi da nije alergičan/na";
  return allergies.map((a) => `${a.type}${a.allergen ? ` (${a.allergen})` : ""}`).join(", ");
}

function renderCurrentVisitSummary(
  answers: NormalizedAnswers,
  appointmentType: string,
  generatedAt: Date,
  labStatus: string | null
): string {
  const lines: string[] = [];

  lines.push("PREGLED SPECIJALISTE – INTERNISTA-ENDOKRINOLOGA");
  lines.push(`Tip pregleda: ${appointmentType}`);
  lines.push(`Datum generisanja sažetka: ${generatedAt.toLocaleDateString("sr-Latn-RS")}`);
  lines.push("NAPOMENA: Ovaj sažetak sadrži isključivo podatke koje je pacijent sam uneo. Ne zamenjuje medicinski pregled niti zvaničnu evidenciju klinike.");
  lines.push("");

  lines.push("ANAMNEZA: GLAVNE TEGOBE");
  lines.push(answers.symptoms || "– pacijent nije naveo tegobe");
  lines.push("");

  lines.push("SADAŠNJA BOLEST");
  lines.push(`Dijagnoza štitaste žlezde: ${answers.diagnosisHistory || "– nije navedeno"}`);
  lines.push(`UZ štitaste žlezde: ${answers.ultrasoundHistory || "– nije navedeno"}`);
  lines.push(`Dodatni simptomi: ${answers.additionalSymptoms || "– nije navedeno"}`);
  lines.push("");

  lines.push("TERAPIJA KOJU PACIJENT UZIMA");
  lines.push(`Terapija štitnjače: ${formatMedications(answers.currentTherapy)}`);
  lines.push(`Ostali lekovi: ${formatMedications(answers.otherMedications)}`);
  lines.push(`Alergije: ${formatAllergies(answers.allergies)}`);
  lines.push("");

  lines.push("LIČNA ANAMNEZA");
  const habits = answers.lifestyleHabits;
  lines.push(`Pušenje: ${habits?.smoking || "– nije navedeno"}`);
  lines.push(`Alkohol: ${habits?.alcohol || "– nije navedeno"}`);
  lines.push(`Ostalo: ${habits?.other || "– nije navedeno"}`);
  lines.push(`Ostale dijagnoze: ${answers.otherConditions || "– nije navedeno"}`);
  lines.push("");

  lines.push("RANIJE BOLESTI I OPERACIJE");
  lines.push(answers.surgicalHistory || "– pacijent nije naveo hirurške zahvate");
  lines.push("");

  lines.push("PORODIČNA ANAMNEZA");
  lines.push(answers.familyHistory || "– pacijent nije naveo porodičnu anamnezu");
  lines.push("");

  lines.push("OBJEKTIVNO");
  lines.push("(Popunjava lekar tokom pregleda)");
  lines.push("");

  lines.push("UZ ŠTITASTE ŽLEZDE");
  lines.push("(Popunjava lekar tokom pregleda)");
  lines.push("");

  lines.push("LABORATORIJSKI NALAZI");
  lines.push(
    labStatus
      ? `Status (pacijent-reported): ${labStatus}`
      : "(Status nije naveden — za detalje pogledati priložene nalaze)"
  );
  lines.push("");

  lines.push("Dg / Th / Kontrola");
  lines.push("(Popunjava lekar tokom pregleda)");

  return lines.join("\n");
}

function renderHistorySummary(
  answers: NormalizedAnswers,
  appointmentType: string,
  generatedAt: Date,
  labStatus: string | null,
  priorAppointments: Array<{ scheduledAt: Date; appointmentType: string }>
): string {
  const current = renderCurrentVisitSummary(answers, appointmentType, generatedAt, labStatus);

  const historyLines: string[] = ["", "RELEVANTNA ANAMNEZA – PRETHODNI PREGLEDI"];
  if (priorAppointments.length === 0) {
    historyLines.push("– nema prethodnih pregleda u sistemu");
  } else {
    for (const appt of priorAppointments) {
      historyLines.push(
        `• ${appt.scheduledAt.toLocaleDateString("sr-Latn-RS")} — ${appt.appointmentType}`
      );
    }
  }

  return current + historyLines.join("\n");
}

/**
 * Generate (or regenerate) both summary variants for an appointment.
 * Called after every questionnaire save/submit.
 * Only the latest summary is stored (upsert on appointmentId + variant).
 */
export async function generateSummaries(appointmentId: string): Promise<void> {
  const [questionnaire] = await db
    .select()
    .from(questionnairesTable)
    .where(eq(questionnairesTable.appointmentId, appointmentId))
    .limit(1);

  if (!questionnaire) return;

  const [appointment] = await db
    .select({
      id: appointmentsTable.id,
      patientId: appointmentsTable.patientId,
      invitedFullName: appointmentsTable.invitedFullName,
      appointmentType: appointmentsTable.appointmentType,
      scheduledAt: appointmentsTable.scheduledAt,
      labStatus: appointmentsTable.labStatus,
    })
    .from(appointmentsTable)
    .where(eq(appointmentsTable.id, appointmentId))
    .limit(1);

  if (!appointment) return;

  const priorAppointments = appointment.patientId
    ? await db
        .select({
          scheduledAt: appointmentsTable.scheduledAt,
          appointmentType: appointmentsTable.appointmentType,
        })
        .from(appointmentsTable)
        .where(
          and(
            eq(appointmentsTable.patientId, appointment.patientId),
            ne(appointmentsTable.id, appointmentId),
            eq(appointmentsTable.excludedFromClinicalViews, false)
          )
        )
    : [];

  const answers = normalizeAnswers((questionnaire.answers ?? {}) as Record<string, unknown>);
  const now = new Date();

  const currentVisitContent = renderCurrentVisitSummary(
    answers,
    appointment.appointmentType,
    now,
    appointment.labStatus
  );

  const historyContent = renderHistorySummary(
    answers,
    appointment.appointmentType,
    now,
    appointment.labStatus,
    priorAppointments
  );

  for (const [variant, content] of [
    ["current_visit", currentVisitContent],
    ["current_visit_plus_history", historyContent],
  ] as const) {
    await db
      .insert(summariesTable)
      .values({ appointmentId, variant, content, generatedAt: now })
      .onConflictDoUpdate({
        target: [summariesTable.appointmentId, summariesTable.variant],
        set: { content, generatedAt: now },
      });
  }

  await writeAuditLog({
    ctx: systemAuditCtx(),
    action: AUDIT_ACTIONS.SUMMARY_GENERATE,
    targetType: "summary",
    targetId: appointmentId,
    outcome: "success",
    context: { variants: ["current_visit", "current_visit_plus_history"] },
  });
}
