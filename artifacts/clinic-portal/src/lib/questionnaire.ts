/**
 * Questionnaire schema access + readable presentation of patient answers.
 *
 * The schema (question labels, section titles, option labels) lives on the backend and is
 * served by the public `GET /api/questionnaires/schema` endpoint. It is the primary source
 * of labels; `src/lib/labels.ts` holds a static fallback so nothing is ever rendered raw.
 */
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { srLatn } from 'date-fns/locale';
import {
  QUESTION_LABELS,
  QUESTIONNAIRE_SECTION_TITLES,
  QUESTION_OPTION_LABELS,
  humanize,
} from './labels';

export type QuestionType =
  | 'single_choice'
  | 'multi_choice'
  | 'free_text'
  | 'medication_list'
  | 'boolean'
  | 'date';

export interface QuestionOption {
  value: string;
  label: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  options?: QuestionOption[];
  conditional?: { parentQuestionId: string; showWhen: string | string[] };
  hint?: string;
  prefillable?: boolean;
  mustConfirm?: boolean;
  neverPrefill?: boolean;
}

export interface SchemaSection {
  id: string;
  title: string;
  questions: Question[];
}

export interface QuestionnaireSchema {
  version: string;
  condition: string;
  sections: SchemaSection[];
}

export interface MedicationRow {
  name: string;
  dose: string;
  frequency: string;
}

export const UNANSWERED_LABEL = 'Nije odgovoreno';

export async function fetchQuestionnaireSchema(): Promise<QuestionnaireSchema> {
  const res = await fetch('/api/questionnaires/schema');
  if (!res.ok) throw new Error('Schema load failed');
  return res.json();
}

/** Shared schema query (public endpoint, safe to cache for the session). */
export function useQuestionnaireSchema() {
  return useQuery({
    queryKey: ['questionnaire-schema'],
    queryFn: fetchQuestionnaireSchema,
    staleTime: 30 * 60 * 1000,
  });
}

/* ------------------------------------------------------------------ *
 * Labels
 * ------------------------------------------------------------------ */

export function findQuestion(
  schema: QuestionnaireSchema | undefined,
  questionId: string
): Question | undefined {
  if (!schema) return undefined;
  for (const section of schema.sections) {
    const found = section.questions.find((q) => q.id === questionId);
    if (found) return found;
  }
  return undefined;
}

export function questionLabel(schema: QuestionnaireSchema | undefined, questionId: string): string {
  const fromSchema = findQuestion(schema, questionId)?.label;
  if (fromSchema) return fromSchema;
  return QUESTION_LABELS[questionId] ?? humanize(questionId);
}

export function sectionTitle(schema: QuestionnaireSchema | undefined, sectionId: string): string {
  const fromSchema = schema?.sections.find((s) => s.id === sectionId)?.title;
  return fromSchema ?? QUESTIONNAIRE_SECTION_TITLES[sectionId] ?? humanize(sectionId);
}

function optionLabel(schema: QuestionnaireSchema | undefined, questionId: string, value: string): string {
  const options = findQuestion(schema, questionId)?.options;
  const fromSchema = options?.find((o) => o.value === value)?.label;
  if (fromSchema) return fromSchema;
  return QUESTION_OPTION_LABELS[value] ?? humanize(value);
}

/* ------------------------------------------------------------------ *
 * Answer formatting
 * ------------------------------------------------------------------ */

export interface FormattedAnswer {
  text: string;
  /** true when the patient did not answer / the value is empty */
  missing: boolean;
}

function isBlank(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function formatMedications(rows: unknown[]): FormattedAnswer {
  const lines = rows
    .map((row) => {
      if (typeof row === 'string') return row.trim();
      if (row && typeof row === 'object') {
        const med = row as Partial<MedicationRow>;
        return [med.name, med.dose, med.frequency].filter(Boolean).join(' · ').trim();
      }
      return '';
    })
    .filter(Boolean);

  if (lines.length === 0) return { text: UNANSWERED_LABEL, missing: true };
  return { text: lines.join('\n'), missing: false };
}

function formatIsoDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return format(date, 'd. MMMM yyyy.', { locale: srLatn });
}

/**
 * Formats a stored questionnaire answer into Serbian text.
 * Never returns raw enum values — option values go through the schema/fallback label maps.
 */
export function formatAnswer(
  schema: QuestionnaireSchema | undefined,
  questionId: string,
  value: unknown
): FormattedAnswer {
  if (isBlank(value)) return { text: UNANSWERED_LABEL, missing: true };

  const question = findQuestion(schema, questionId);

  if (typeof value === 'boolean') {
    return { text: value ? 'Da' : 'Ne', missing: false };
  }

  if (question?.type === 'date' || questionId === 'date_of_birth') {
    if (typeof value === 'string') return { text: formatIsoDate(value), missing: false };
  }

  if (Array.isArray(value)) {
    if (value.length > 0 && value.every((item) => typeof item === 'string')) {
      if (question?.type === 'medication_list') return formatMedications(value);
      return {
        text: (value as string[]).map((item) => optionLabel(schema, questionId, item)).join(', '),
        missing: false,
      };
    }
    return formatMedications(value);
  }

  if (typeof value === 'string') {
    if (question?.type === 'single_choice' || question?.type === 'multi_choice') {
      return { text: optionLabel(schema, questionId, value), missing: false };
    }
    return { text: value, missing: false };
  }

  if (typeof value === 'number') return { text: String(value), missing: false };

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => !isBlank(v));
    if (entries.length === 0) return { text: UNANSWERED_LABEL, missing: true };
    return {
      text: entries.map(([key, v]) => `${QUESTION_LABELS[key] ?? humanize(key)}: ${String(v)}`).join(', '),
      missing: false,
    };
  }

  return { text: String(value), missing: false };
}

/* ------------------------------------------------------------------ *
 * Grouping (readable sections instead of a raw key/value dump)
 * ------------------------------------------------------------------ */

export interface AnswerEntry {
  questionId: string;
  label: string;
  text: string;
  missing: boolean;
}

export interface AnswerGroup {
  sectionId: string;
  title: string;
  entries: AnswerEntry[];
  missingCount: number;
}

/** Flattens legacy nested (per-section) answers into the flat shape used by the schema. */
export function flattenAnswers(
  schema: QuestionnaireSchema | undefined,
  answers: Record<string, unknown> | undefined | null
): Record<string, unknown> {
  if (!answers) return {};
  const flat: Record<string, unknown> = {};
  const sectionIds = new Set(schema?.sections.map((s) => s.id) ?? []);
  for (const [key, value] of Object.entries(answers)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && sectionIds.has(key)) {
      Object.assign(flat, value as Record<string, unknown>);
    } else {
      flat[key] = value;
    }
  }
  return flat;
}

/** Groups answers by questionnaire section, keeping unanswered questions visible. */
export function groupAnswers(
  schema: QuestionnaireSchema | undefined,
  answers: Record<string, unknown> | undefined | null
): AnswerGroup[] {
  const flat = flattenAnswers(schema, answers);
  const known = new Set<string>();
  const groups: AnswerGroup[] = [];

  for (const section of schema?.sections ?? []) {
    const entries: AnswerEntry[] = section.questions.map((question) => {
      known.add(question.id);
      const formatted = formatAnswer(schema, question.id, flat[question.id]);
      return {
        questionId: question.id,
        label: question.label,
        text: formatted.text,
        missing: formatted.missing,
      };
    });
    groups.push({
      sectionId: section.id,
      title: section.title,
      entries,
      missingCount: entries.filter((e) => e.missing).length,
    });
  }

  const extraEntries: AnswerEntry[] = Object.entries(flat)
    .filter(([key]) => !known.has(key))
    .map(([key, value]) => {
      const formatted = formatAnswer(schema, key, value);
      return {
        questionId: key,
        label: QUESTION_LABELS[key] ?? humanize(key),
        text: formatted.text,
        missing: formatted.missing,
      };
    })
    .filter((entry) => !entry.missing);

  if (extraEntries.length > 0) {
    groups.push({
      sectionId: 'other',
      title: 'Ostali podaci',
      entries: extraEntries,
      missingCount: 0,
    });
  }

  return groups;
}

export function countMissingAnswers(groups: AnswerGroup[]): number {
  return groups.reduce((total, group) => total + group.missingCount, 0);
}

export function countAnsweredQuestions(groups: AnswerGroup[]): number {
  return groups.reduce((total, group) => total + group.entries.filter((e) => !e.missing).length, 0);
}


