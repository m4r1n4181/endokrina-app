/**
 * What the patient should prepare / bring, per appointment type
 * (UX requirements, patient flow step 3 — "appointment-specific guidance on
 * recommended/required labs and freshness, if configured").
 *
 * DEMO DEFAULTS: the clinic has not configured this yet. The wording below is a sensible
 * starting point for a thyroid clinic and should be confirmed by the clinic before real use;
 * later it belongs in backend configuration next to APPOINTMENT_TYPES_EXPECTING_LABS.
 */
export interface PrepGuidance {
  /** One sentence on whether labs are needed for this visit. */
  labsNote: string;
  /** Concrete items to prepare, in plain language. */
  items: string[];
}

const COMMON_LAST_ITEM = 'Spisak lekova koje trenutno uzimate, sa dozama (ili same kutije lekova)';

const GUIDANCE: Record<string, PrepGuidance> = {
  initial_consultation: {
    labsNote: 'Za prvi pregled su potrebni skoriji nalazi hormona štitaste žlezde.',
    items: [
      'Nalazi TSH i FT4 (i antitela, ako ste ih radili) — ne stariji od 3 meseca',
      'Raniji nalazi ultrazvuka štitaste žlezde, ako ih imate',
      'Raniji izveštaji endokrinologa ili lekara opšte prakse, ako ih imate',
      COMMON_LAST_ITEM,
    ],
  },
  follow_up: {
    labsNote: 'Za kontrolu su potrebni novi nalazi, urađeni posle prošlog pregleda.',
    items: [
      'Nalazi koje je doktor tražio na prošlom pregledu (najčešće TSH i FT4) — ne stariji od 3 meseca',
      'Izveštaj sa prošlog pregleda',
      COMMON_LAST_ITEM,
    ],
  },
  post_op: {
    labsNote: 'Za kontrolu posle operacije su potrebni skoriji nalazi.',
    items: [
      'Otpusna lista i patohistološki nalaz',
      'Nalazi koje je tražio hirurg ili doktor (npr. TSH, FT4, kalcijum) — ne stariji od 1 meseca',
      COMMON_LAST_ITEM,
    ],
  },
  ultrasound: {
    labsNote: 'Za ultrazvuk laboratorijski nalazi nisu obavezni.',
    items: [
      'Uput, ako ga imate',
      'Raniji nalazi ultrazvuka, radi poređenja',
      COMMON_LAST_ITEM,
    ],
  },
};

const FALLBACK: PrepGuidance = {
  labsNote: 'Ako imate skorije nalaze vezane za štitastu žlezdu, ponesite ih ili ih dodajte ovde.',
  items: ['Skoriji laboratorijski nalazi, ako ih imate', COMMON_LAST_ITEM],
};

export function prepGuidanceFor(appointmentType?: string | null): PrepGuidance {
  return (appointmentType && GUIDANCE[appointmentType]) || FALLBACK;
}

