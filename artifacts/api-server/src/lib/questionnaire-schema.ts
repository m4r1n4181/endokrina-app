/**
 * Questionnaire schema configuration — data-driven, not hardcoded form markup.
 * Required by NFR-012: schema + templates configurable without code changes.
 * Designed for reuse across endocrine conditions (not just thyroid).
 *
 * Schema version: thyroid_v1
 * Language: Serbian Latin script
 *
 * Conditional logic rule: never show a follow-up question when the parent answer is negative.
 */

export type QuestionType =
  | "single_choice"
  | "multi_choice"
  | "free_text"
  | "medication_list"   // structured: name + dose + frequency
  | "boolean"
  | "date";

export interface QuestionOption {
  value: string;
  label: string; // Serbian
}

export interface ConditionalRule {
  parentQuestionId: string;
  showWhen: string | string[]; // show this question when parent answer matches
}

export interface Question {
  id: string;
  type: QuestionType;
  label: string;        // Serbian
  required: boolean;
  options?: QuestionOption[];
  conditional?: ConditionalRule;
  hint?: string;        // Serbian — shown below the question
  prefillable?: boolean; // stable fields that can be shown prefilled
  mustConfirm?: boolean; // medication-like fields — patient must actively confirm, never silently carry forward
  neverPrefill?: boolean; // visit-specific fields — always answered fresh
}

export interface QuestionnaireSchema {
  version: string;
  condition: string;
  sections: Array<{
    id: string;
    title: string; // Serbian
    questions: Question[];
  }>;
}

/**
 * Thyroid questionnaire v1 — ~10-12 clinical question groups.
 * Based on clinical scope from 01-FEATURES-AND-REQUIREMENTS.md.
 * Final wording/ordering TBD with product owner — this is the initial schema.
 */
export const THYROID_QUESTIONNAIRE_V1: QuestionnaireSchema = {
  version: "thyroid_v1",
  condition: "thyroid",
  sections: [
    {
      id: "stable_profile",
      title: "Lični podaci (prefilirani — proverite tačnost)",
      questions: [
        {
          id: "full_name",
          type: "free_text",
          label: "Ime i prezime",
          required: true,
          prefillable: true,
        },
        {
          id: "date_of_birth",
          type: "date",
          label: "Datum rođenja",
          required: true,
          prefillable: true,
        },
        {
          id: "sex",
          type: "single_choice",
          label: "Pol",
          required: false,
          prefillable: true,
          options: [
            { value: "male", label: "Muški" },
            { value: "female", label: "Ženski" },
            { value: "other", label: "Drugo" },
            { value: "prefer_not_to_say", label: "Ne želim da navedem" },
          ],
        },
        {
          id: "height_cm",
          type: "free_text",
          label: "Visina (cm)",
          required: false,
          prefillable: true,
          hint: "Npr. 170",
        },
      ],
    },
    {
      id: "main_complaint",
      title: "Razlog posete",
      questions: [
        {
          id: "symptoms",
          type: "free_text",
          label: "Opišite vaše glavne tegobe (zamor, promena raspoloženja, promena telesne mase, pospanost, zaboravljivost, smanjena energija, gubitak kose, suva koža, otoci lica/šaka/nogu...)",
          required: false,
          neverPrefill: true,
          hint: "Opišite šta vas trenutno muči. Ne morate navoditi dijagnoze.",
        },
      ],
    },
    {
      id: "thyroid_history",
      title: "Istorija bolesti štitaste žlezde",
      questions: [
        {
          id: "has_thyroid_diagnosis",
          type: "boolean",
          label: "Da li vam je ranije dijagnostikovana bolest štitaste žlezde (npr. autoimuna bolest štitaste žlezde)?",
          required: false,
        },
        {
          id: "diagnosis_history",
          type: "free_text",
          label: "Kada je dijagnoza postavljena i o kojoj bolesti se radi?",
          required: false,
          conditional: { parentQuestionId: "has_thyroid_diagnosis", showWhen: "true" },
        },
        {
          id: "has_ultrasound",
          type: "boolean",
          label: "Da li ste ikada radili ultrazvuk štitaste žlezde?",
          required: false,
        },
        {
          id: "ultrasound_findings",
          type: "free_text",
          label: "Šta je pronađeno (čvorići, ciste, nešto drugo)?",
          required: false,
          conditional: { parentQuestionId: "has_ultrasound", showWhen: "true" },
        },
      ],
    },
    {
      id: "current_therapy",
      title: "Terapija koju uzimate",
      questions: [
        {
          id: "current_thyroid_therapy",
          type: "medication_list",
          label: "Terapija za štitastu žlezdu (npr. levotiroksin/Euthyrox)",
          required: false,
          mustConfirm: true,
          hint: "Prošli put ste naveli sledeće lekove. Da li ih i dalje uzimate u istoj dozi?",
        },
        {
          id: "other_medications",
          type: "medication_list",
          label: "Ostala terapija (drugi lekovi, dodaci ishrani)",
          required: false,
          mustConfirm: true,
        },
      ],
    },
    {
      id: "additional_symptoms",
      title: "Dodatni simptomi",
      questions: [
        {
          id: "cardiac_symptoms",
          type: "boolean",
          label: "Da li imate lupanje srca, preskakanje srca, gušenje, vrtoglavicu ili kratke epizode gubitka svesti?",
          required: false,
        },
        {
          id: "musculoskeletal_symptoms",
          type: "boolean",
          label: "Da li imate bolove u kostima, zglobovima ili mišićima?",
          required: false,
        },
      ],
    },
    {
      id: "allergies",
      title: "Alergije",
      questions: [
        {
          id: "has_allergies",
          type: "boolean",
          label: "Da li imate poznate alergije (na hranu ili lekove)?",
          required: false,
        },
        {
          id: "allergies_list",
          type: "free_text",
          label: "Navedite alergene (npr. penicilin, orasi):",
          required: false,
          conditional: { parentQuestionId: "has_allergies", showWhen: "true" },
        },
      ],
    },
    {
      id: "lifestyle",
      title: "Navike",
      questions: [
        {
          id: "smoking",
          type: "single_choice",
          label: "Pušenje",
          required: false,
          options: [
            { value: "non_smoker", label: "Ne pušim" },
            { value: "smoker", label: "Pušim" },
            { value: "ex_smoker", label: "Bivši pušač" },
            { value: "prefer_not_to_say", label: "Ne želim da navedem" },
          ],
        },
        {
          id: "alcohol",
          type: "single_choice",
          label: "Alkohol",
          required: false,
          options: [
            { value: "none", label: "Ne konzumiram" },
            { value: "occasional", label: "Povremeno" },
            { value: "regular", label: "Redovno" },
            { value: "prefer_not_to_say", label: "Ne želim da navedem" },
          ],
        },
      ],
    },
    {
      id: "medical_history",
      title: "Lična i porodična anamneza",
      questions: [
        {
          id: "other_conditions",
          type: "free_text",
          label: "Ostale dijagnoze (dijabetes, srčane bolesti, hipertenzija, i sl.)",
          required: false,
        },
        {
          id: "surgical_history",
          type: "free_text",
          label: "Operacije (koje i kada, ako je primenljivo)",
          required: false,
        },
        {
          id: "has_family_history",
          type: "boolean",
          label: "Da li u porodici postoji dijabetes, srčane bolesti, infarkt, šlog ili maligna bolest?",
          required: false,
        },
        {
          id: "family_history_details",
          type: "free_text",
          label: "Navedite ko i šta (npr. majka — dijabetes tip 2):",
          required: false,
          conditional: { parentQuestionId: "has_family_history", showWhen: "true" },
        },
      ],
    },
    {
      id: "preferences",
      title: "Vaše preference (opciono — ne utiče na pregled)",
      questions: [
        {
          id: "communication_channel",
          type: "single_choice",
          label: "Preferiran kanal komunikacije za obaveštenja",
          required: false,
          options: [
            { value: "viber", label: "Viber" },
            { value: "sms", label: "SMS" },
            { value: "email", label: "Email" },
          ],
        },
        {
          id: "needs_prep_guidance",
          type: "boolean",
          label: "Da li želite uputstvo šta da donesete na pregled?",
          required: false,
        },
        {
          id: "needs_digital_help",
          type: "boolean",
          label: "Da li vam je potrebna pomoć sa popunjavanjem ovog formulara?",
          required: false,
        },
        {
          id: "document_preference",
          type: "single_choice",
          label: "Donosite li nalaze u digitalnom ili fizičkom obliku?",
          required: false,
          options: [
            { value: "digital", label: "Digitalno (fajl)" },
            { value: "physical", label: "Fizički primerak" },
            { value: "both", label: "I jedno i drugo" },
          ],
        },
      ],
    },
  ],
};

export function getAllowedQuestionIds(schema: QuestionnaireSchema): Set<string> {
  const ids = new Set<string>();
  for (const section of schema.sections) {
    for (const q of section.questions) ids.add(q.id);
  }
  return ids;
}
/**
 * Get a schema by version identifier.
 * Extend this map as new condition schemas are added.
 */
const SCHEMA_REGISTRY: Record<string, QuestionnaireSchema> = {
  thyroid_v1: THYROID_QUESTIONNAIRE_V1,
};

export function getQuestionnaireSchema(version: string): QuestionnaireSchema | null {
  return SCHEMA_REGISTRY[version] ?? null;
}

// GET /api/questionnaires/schema/:version
export { SCHEMA_REGISTRY };
