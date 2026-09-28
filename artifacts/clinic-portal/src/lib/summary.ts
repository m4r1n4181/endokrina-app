/**
 * Presentation helpers for the backend-generated templated summaries.
 *
 * The summary text itself is generated on the backend (deterministic templates, no LLM). Two
 * presentation problems are solved here, without touching the backend contract:
 *   1. Raw enum values leaking into the text (e.g. `Tip pregleda: follow_up`,
 *      `Status (pacijent-reported): no_results_available`) are replaced with Serbian labels,
 *      so the copy-paste text handed to the doctor is clean.
 *   2. Lines where the patient did not provide data ("– nije navedeno") are marked so the UI
 *      can show the gap clearly instead of hiding it (UX requirement 7).
 */
import { APPOINTMENT_TYPE_LABELS, LAB_STATUS_LABELS, humanize } from './labels';

const RAW_TOKEN_MAP: Record<string, string> = {
  ...APPOINTMENT_TYPE_LABELS,
  ...LAB_STATUS_LABELS,
};

const MISSING_MARKERS = [
  'nije navedeno',
  'nije naveo',
  'nije navedena',
  'nije naveden',
  'nije precizirano',
  'nije dostupno',
  'nema prethodnih pregleda',
  'navodi da ne uzima lekove',
];

const DOCTOR_FILL_MARKER = 'popunjava lekar';

/**
 * Replaces raw snake_case identifiers and the English "pacijent-reported" tag with Serbian
 * labels. Returns the text that is rendered AND copied to the clipboard.
 */
export function normalizeSummaryContent(content: string): string {
  if (!content) return '';

  let normalized = content
    .replace(/Tip pregleda:\s*(\S+)/gi, (_match, value: string) => `Tip pregleda: ${RAW_TOKEN_MAP[value] ?? humanize(value)}`)
    .replace(/Status \(pacijent-reported\)/gi, 'Status nalaza (prijavio pacijent)');

  normalized = normalized.replace(/\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g, (token) => RAW_TOKEN_MAP[token] ?? humanize(token));

  return normalized;
}

export type SummaryLineType = 'heading' | 'text' | 'missing' | 'doctor-note';

export interface SummaryLine {
  type: SummaryLineType;
  text: string;
}

function isHeading(line: string): boolean {
  if (line.length < 3) return false;
  if (line.includes(':')) return false;
  return line === line.toUpperCase() && /[A-ZČĆŽŠĐ]/.test(line);
}

function isMissing(line: string): boolean {
  const lower = line.toLowerCase();
  return MISSING_MARKERS.some((marker) => lower.includes(marker));
}

/** Splits normalized summary text into renderable lines with their semantic role. */
export function getSummaryLines(normalizedContent: string): SummaryLine[] {
  return normalizedContent.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return { type: 'text' as const, text: '' };
    if (line.includes('(') && line.toLowerCase().includes(DOCTOR_FILL_MARKER)) {
      return { type: 'doctor-note' as const, text: trimmed };
    }
    if (isHeading(trimmed)) return { type: 'heading' as const, text: trimmed };
    if (isMissing(trimmed)) return { type: 'missing' as const, text: trimmed };
    return { type: 'text' as const, text: trimmed };
  });
}

export function countMissingLines(lines: SummaryLine[]): number {
  return lines.filter((line) => line.type === 'missing').length;
}
