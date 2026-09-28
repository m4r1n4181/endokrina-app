/**
 * Pure helpers for the date-of-birth input.
 *
 * Kept free of React/UI imports so the logic can be unit-tested and reused
 * (staff appointment form, patient identity verification, questionnaire "date" questions).
 *
 * The wire/contract format is always `YYYY-MM-DD` (what the API and zod schemas expect);
 * the display format is Serbian Latin (`15. maj 1980.`).
 */
import { format, getDaysInMonth } from 'date-fns';
import { srLatn } from 'date-fns/locale';

export const MONTH_NAMES: string[] = Array.from({ length: 12 }, (_, index) =>
  format(new Date(2000, index, 1), 'LLLL', { locale: srLatn })
);

export const CURRENT_YEAR = new Date().getFullYear();
export const MIN_YEAR = CURRENT_YEAR - 110;
export const YEARS: number[] = Array.from(
  { length: CURRENT_YEAR - MIN_YEAR + 1 },
  (_, index) => CURRENT_YEAR - index
);

export const DAYS_IN_MONTH_LIST: number[] = Array.from({ length: 31 }, (_, index) => index + 1);

export interface DobParts {
  day?: number;
  month?: number;
  year?: number;
}

/** Parses `YYYY-MM-DD`; anything else yields an empty (incomplete) selection. */
export function parseDateOfBirth(value?: string | null): DobParts {
  if (!value) return {};
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return {};
  const day = Number(match[3]);
  const month = Number(match[2]);
  const year = Number(match[1]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1) return {};
  return { day, month, year };
}

/** Returns `YYYY-MM-DD`, or an empty string while the date is still incomplete. */
export function composeDateOfBirth(parts: DobParts): string {
  const { day, month, year } = parts;
  if (!day || !month || !year) return '';
  if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1) return '';
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function isCompleteDateOfBirth(parts: DobParts): boolean {
  return composeDateOfBirth(parts) !== '';
}

/** Number of days in the month of the given parts (31 when only the day is known). */
export function daysInDobMonth(parts: DobParts): number {
  if (!parts.month || !parts.year) return 31;
  return getDaysInMonth(new Date(parts.year, parts.month - 1, 1));
}

/** Clamps the day to a valid day of the chosen month (e.g. 31. februar → 28/29). */
export function clampDobParts(parts: DobParts): DobParts {
  if (!parts.day || !parts.month || !parts.year) return parts;
  const maxDay = daysInDobMonth(parts);
  if (parts.day <= maxDay) return parts;
  return { ...parts, day: maxDay };
}

/** `15. maj 1980.` — empty string for an incomplete/invalid value. */
export function formatDateOfBirth(value?: string | null): string {
  const parts = parseDateOfBirth(value);
  if (!composeDateOfBirth(parts)) return '';
  return format(new Date(parts.year!, parts.month! - 1, parts.day!), 'd. MMMM yyyy.', { locale: srLatn });
}

/** What is still missing, for the helper text under the dropdowns. */
export function missingDobParts(parts: DobParts): string[] {
  const missing: string[] = [];
  if (!parts.day) missing.push('dan');
  if (!parts.month) missing.push('mesec');
  if (!parts.year) missing.push('godinu');
  return missing;
}