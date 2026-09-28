/**
 * Single source of truth for user-facing labels of every value that comes from the
 * database / API (statuses, appointment types, lab statuses, roles, enum values).
 *
 * Rule (hard requirement): a raw snake_case value must NEVER be rendered in the UI —
 * always go through `labelFor(...)` / the typed helpers below. Unknown values are
 * humanized instead of being printed raw.
 */

export type LabelMap = Record<string, string>;

export interface SelectOption {
  value: string;
  label: string;
}

function toOptions(map: LabelMap): SelectOption[] {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

/** Converts `some_unknown_value` into `Some unknown value` (fallback only). */
export function humanize(value: string): string {
  const spaced = value.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Looks up a label, never returns a raw enum value. */
export function labelFor(map: LabelMap, value?: string | null): string {
  if (value === undefined || value === null || value === '') return '–';
  return map[value] ?? humanize(value);
}

/* ------------------------------------------------------------------ *
 * Tip pregleda (appointment type)
 * ------------------------------------------------------------------ */

export const APPOINTMENT_TYPE_LABELS: LabelMap = {
  initial_consultation: 'Prvi pregled',
  follow_up: 'Kontrola',
  ultrasound: 'Ultrazvuk',
  post_op: 'Postoperativna kontrola',
};

export const APPOINTMENT_TYPE_OPTIONS: SelectOption[] = toOptions(APPOINTMENT_TYPE_LABELS);

export function appointmentTypeLabel(value?: string | null): string {
  return labelFor(APPOINTMENT_TYPE_LABELS, value);
}

/**
 * Types of appointment for which recent lab results are expected
 * (used for the "Strong warning" badge — table 4 of the UX requirements).
 * NOTE: the clinic has not configured this per type yet, so this is a frontend
 * assumption that should later come from backend configuration.
 */
export const APPOINTMENT_TYPES_EXPECTING_LABS: string[] = [
  'initial_consultation',
  'follow_up',
  'post_op',
];

export const LAB_STATUS_WARNING_VALUES: string[] = ['no_results_available', 'results_pending'];

export function expectsLabs(appointmentType?: string | null): boolean {
  if (!appointmentType) return false;
  return APPOINTMENT_TYPES_EXPECTING_LABS.includes(appointmentType);
}

/** "Strong warning" (table 4): labs are missing / pending for a type that needs them. */
export function hasLabsWarning(appointmentType?: string | null, labStatus?: string | null): boolean {
  if (!expectsLabs(appointmentType)) return false;
  if (!labStatus) return true;
  return LAB_STATUS_WARNING_VALUES.includes(labStatus);
}

/* ------------------------------------------------------------------ *
 * Status termina (appointment status)
 * ------------------------------------------------------------------ */

export const APPOINTMENT_STATUS_LABELS: LabelMap = {
  draft_invitation: 'Nacrt',
  link_sent: 'Link poslat',
  opened: 'Otvoreno',
  in_progress: 'U toku',
  submitted: 'Poslato',
  locked: 'Zaključano',
  reopened: 'Ponovo otvoreno',
  rescheduled: 'Pomereno',
  cancelled: 'Otkazano',
};

/** Plain-language meaning of each status (tooltips / legends). */
export const APPOINTMENT_STATUS_MEANINGS: LabelMap = {
  draft_invitation: 'Pozivnica je pripremljena, link još nije poslat pacijentu.',
  link_sent: 'Link za pripremu je poslat, pacijent ga još nije otvorio.',
  opened: 'Pacijent je otvorio link i verifikovao svoj identitet.',
  in_progress: 'Pacijent je počeo da popunjava upitnik, ali još nije poslao.',
  submitted: 'Pacijent je poslao ili sačuvao odgovore.',
  locked: 'Upitnik je zaključan za ovaj termin; izmene nisu moguće bez ponovnog otvaranja.',
  reopened: 'Klinika je ponovo otvorila upitnik za izmene.',
  rescheduled: 'Termin je pomeren; isti link i sačuvani podaci ostaju važeći.',
  cancelled: 'Termin je otkazan, a link je deaktiviran.',
};

export function appointmentStatusLabel(value?: string | null): string {
  return labelFor(APPOINTMENT_STATUS_LABELS, value);
}

/* ------------------------------------------------------------------ *
 * Status nalaza (lab status)
 * ------------------------------------------------------------------ */

export const LAB_STATUS_LABELS: LabelMap = {
  uploaded_digitally: 'Nalazi otpremljeni',
  will_bring_physical: 'Doneće fizički',
  results_pending: 'Nalazi na čekanju',
  no_results_available: 'Nema nalaza',
  not_required: 'Nije potrebno',
};

export const LAB_STATUS_MEANINGS: LabelMap = {
  uploaded_digitally: 'Pacijent je otpremio digitalne nalaze.',
  will_bring_physical: 'Pacijent donosi fizičke nalaze na pregled.',
  results_pending: 'Nalazi još nisu gotovi u trenutku pripreme.',
  no_results_available: 'Pacijent trenutno nema dostupne nalaze.',
  not_required: 'Nalazi nisu potrebni za ovaj tip pregleda.',
};

/** Patient-facing wording (first person), used on the upload step. */
export const LAB_STATUS_PATIENT_OPTIONS: SelectOption[] = [
  { value: 'uploaded_digitally', label: 'Otpremio/la sam digitalne nalaze' },
  { value: 'will_bring_physical', label: 'Doneću fizičke nalaze na pregled' },
  { value: 'results_pending', label: 'Nalazi još nisu gotovi' },
  { value: 'no_results_available', label: 'Nemam dostupne nalaze' },
  { value: 'not_required', label: 'Nisu potrebni za ovaj tip pregleda' },
];

export function labStatusLabel(value?: string | null): string {
  return labelFor(LAB_STATUS_LABELS, value);
}

/* ------------------------------------------------------------------ *
 * Ostale enumeracije
 * ------------------------------------------------------------------ */

export const STAFF_ROLE_LABELS: LabelMap = {
  doctor: 'Doktor',
  clinic_admin: 'Administrator',
  nurse: 'Medicinska sestra',
};

export const SEX_LABELS: LabelMap = {
  male: 'Muški',
  female: 'Ženski',
  other: 'Drugo',
  prefer_not_to_say: 'Ne želim da navedem',
};

export const QUESTIONNAIRE_STATUS_LABELS: LabelMap = {
  not_started: 'Nije početo',
  consent_given: 'Saglasnost data',
  in_progress: 'U toku',
  saved: 'Sačuvano',
  submitted: 'Poslato',
  locked: 'Zaključano',
};

export const SUMMARY_VARIANT_LABELS: LabelMap = {
  current_visit: 'Sažetak trenutne posete',
  current_visit_plus_history: 'Sažetak + relevantna istorija',
};

export const SUMMARY_VARIANT_HINTS: LabelMap = {
  current_visit: 'Kratak sažetak za brzo čitanje i prenošenje u nalaz.',
  current_visit_plus_history:
    'Duži sažetak koji uz ovu posetu uključuje i prethodne preglede iz sistema.',
};

export const DOCUMENT_TYPE_LABELS: LabelMap = {
  lab_result: 'Laboratorijski nalaz',
  other: 'Dokument',
  referral: 'Uput',
  report: 'Izveštaj',
};

export function staffRoleLabel(value?: string | null): string {
  return labelFor(STAFF_ROLE_LABELS, value);
}

export function sexLabel(value?: string | null): string {
  if (!value) return 'Nije navedeno';
  return labelFor(SEX_LABELS, value);
}

export function summaryVariantLabel(value?: string | null): string {
  return labelFor(SUMMARY_VARIANT_LABELS, value);
}

export function questionnaireStatusLabel(value?: string | null): string {
  return labelFor(QUESTIONNAIRE_STATUS_LABELS, value);
}

/* ------------------------------------------------------------------ *
 * Upitnik — fallback labele
 * Primary source of question labels is /api/questionnaires/schema (see lib/questionnaire.ts);
 * these maps are only used when the schema cannot be loaded.
 * ------------------------------------------------------------------ */

export const QUESTIONNAIRE_SECTION_TITLES: LabelMap = {
  stable_profile: 'Lični podaci',
  main_complaint: 'Razlog posete',
  thyroid_history: 'Istorija bolesti štitaste žlezde',
  current_therapy: 'Terapija koju uzimate',
  additional_symptoms: 'Dodatni simptomi',
  allergies: 'Alergije',
  lifestyle: 'Navike',
  medical_history: 'Lična i porodična anamneza',
  preferences: 'Vaše preference',
};

export const QUESTION_LABELS: LabelMap = {
  full_name: 'Ime i prezime',
  date_of_birth: 'Datum rođenja',
  sex: 'Pol',
  symptoms: 'Glavne tegobe',
  has_thyroid_diagnosis: 'Ranije dijagnostikovana bolest štitaste žlezde',
  diagnosis_history: 'Kada je dijagnoza postavljena i o kojoj bolesti se radi',
  has_ultrasound: 'Prethodni ultrazvuk štitaste žlezde',
  ultrasound_findings: 'Nalaz ultrazvuka',
  current_thyroid_therapy: 'Terapija za štitastu žlezdu',
  other_medications: 'Ostala terapija',
  cardiac_symptoms: 'Kardijalni simptomi (lupanje srca, gušenje, vrtoglavica)',
  musculoskeletal_symptoms: 'Bolovi u kostima, zglobovima ili mišićima',
  has_allergies: 'Poznate alergije',
  allergies_list: 'Navedeni alergeni',
  smoking: 'Pušenje',
  alcohol: 'Alkohol',
  other_conditions: 'Ostale dijagnoze',
  surgical_history: 'Operacije',
  has_family_history: 'Porodična anamneza',
  family_history_details: 'Detalji porodične anamneze',
  communication_channel: 'Preferiran kanal komunikacije',
  needs_prep_guidance: 'Želi uputstvo šta doneti na pregled',
  needs_digital_help: 'Potrebna pomoć sa popunjavanjem formulara',
  document_preference: 'Nalazi u digitalnom ili fizičkom obliku',
};

/** Labels for option values that can appear without a loaded schema. */
export const QUESTION_OPTION_LABELS: LabelMap = {
  male: 'Muški',
  female: 'Ženski',
  other: 'Drugo',
  prefer_not_to_say: 'Ne želim da navedem',
  non_smoker: 'Ne pušim',
  smoker: 'Pušim',
  ex_smoker: 'Bivši pušač',
  none: 'Ne konzumiram',
  occasional: 'Povremeno',
  regular: 'Redovno',
  viber: 'Viber',
  sms: 'SMS',
  email: 'Email',
  digital: 'Digitalno (fajl)',
  physical: 'Fizički primerak',
  both: 'I jedno i drugo',
  true: 'Da',
  false: 'Ne',
};

