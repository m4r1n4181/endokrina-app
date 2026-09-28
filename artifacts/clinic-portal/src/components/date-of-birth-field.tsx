/**
 * Date-of-birth input built from three dropdowns (dan / mesec / godina).
 *
 * Why not a calendar picker: a doctor/nurse (or patient) entering a birth date 40–70 years
 * back would have to page through hundreds of months. Three dropdowns are faster, have large
 * touch targets and work one-handed on a phone (mobile-first requirement for the patient flow).
 *
 * The value contract handed to the parent is a plain `YYYY-MM-DD` string, so it drops into
 * react-hook-form and the existing zod schemas unchanged.
 *
 * IMPORTANT: the three dropdowns keep their own partial state and only emit `YYYY-MM-DD` once
 * day + month + year are all chosen. Deriving them directly from the ISO string would make the
 * parent value empty after the first pick and silently reset the other two dropdowns — which is
 * exactly what made this field fail validation for every date before.
 */
import * as React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  DAYS_IN_MONTH_LIST,
  MONTH_NAMES,
  YEARS,
  clampDobParts,
  composeDateOfBirth,
  daysInDobMonth,
  formatDateOfBirth,
  missingDobParts,
  parseDateOfBirth,
  type DobParts,
} from '@/lib/date-of-birth';

export type { DobParts };
export { composeDateOfBirth, formatDateOfBirth, parseDateOfBirth };

export interface DateOfBirthFieldProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange' | 'value' | 'defaultValue' | 'ref'> {
  value?: string | null;
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  /** `patient` uses larger touch targets / text for the mobile-first patient flow. */
  variant?: 'staff' | 'patient';
  ref?: React.Ref<HTMLDivElement>;
}

export function DateOfBirthField({
  value,
  onChange,
  onBlur,
  disabled,
  variant = 'staff',
  className,
  ref,
  ...rest
}: DateOfBirthFieldProps) {
  const [parts, setParts] = React.useState<DobParts>(() => parseDateOfBirth(value));
  const composed = composeDateOfBirth(parts);
  const isPatient = variant === 'patient';

  // Latest values in refs, so several picks in quick succession never overwrite each other and
  // the sync effect below never fights the user's own input.
  const partsRef = React.useRef(parts);
  partsRef.current = parts;
  const composedRef = React.useRef(composed);
  composedRef.current = composed;

  // Follow external changes (patient prefill, form reset, answers loaded from the API).
  React.useEffect(() => {
    if ((value ?? '') !== composedRef.current) {
      setParts(parseDateOfBirth(value));
    }
  }, [value]);

  const dayTriggerRef = React.useRef<HTMLButtonElement>(null);
  const monthTriggerRef = React.useRef<HTMLButtonElement>(null);
  const yearTriggerRef = React.useRef<HTMLButtonElement>(null);

  const focusNext = (target: React.RefObject<HTMLButtonElement | null>) => {
    // The dropdown is closing at this point — move focus on the next tick.
    window.setTimeout(() => target.current?.focus(), 0);
  };

  const update = (patch: DobParts, nextRef?: React.RefObject<HTMLButtonElement | null>) => {
    const next = clampDobParts({ ...partsRef.current, ...patch });

    partsRef.current = next;
    setParts(next);

    const iso = composeDateOfBirth(next);
    // Only notify the parent when the emitted value actually changes (never emit a partial date).
    if (iso !== composedRef.current) {
      composedRef.current = iso;
      onChange(iso);
    }

    if (nextRef) focusNext(nextRef);
  };

  const missing = missingDobParts(parts);
  const maxDay = daysInDobMonth(parts);

  const triggerClass = isPatient ? 'h-14 text-base rounded-xl bg-gray-50 border-gray-200' : 'h-10';
  const labelClass = isPatient ? 'text-sm text-gray-600' : 'text-xs text-gray-500';

  /** Focus moves to the next dropdown once one is chosen, so three picks need no tapping around. */
  return (
    <div className={cn('space-y-1', className)} ref={ref} onBlur={onBlur} {...rest}>
      <div className={cn('grid gap-2', isPatient ? 'grid-cols-3' : 'grid-cols-[5rem_1fr_6.5rem]')}>
        <div className="space-y-1">
          <span className={labelClass}>Dan</span>
          <Select
            value={parts.day ? String(parts.day) : ''}
            onValueChange={(v) => update({ day: Number(v) }, monthTriggerRef)}
            disabled={disabled}
          >
            <SelectTrigger
              ref={dayTriggerRef}
              className={triggerClass}
              aria-label="Dan rođenja"
              data-testid="select-dob-day"
            >
              <SelectValue placeholder="Dan" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {DAYS_IN_MONTH_LIST.map((day) => (
                <SelectItem key={day} value={String(day)} disabled={day > maxDay}>
                  {day}.
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <span className={labelClass}>Mesec</span>
          <Select
            value={parts.month ? String(parts.month) : ''}
            onValueChange={(v) => update({ month: Number(v) }, yearTriggerRef)}
            disabled={disabled}
          >
            <SelectTrigger
              ref={monthTriggerRef}
              className={triggerClass}
              aria-label="Mesec rođenja"
              data-testid="select-dob-month"
            >
              <SelectValue placeholder="Mesec" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {MONTH_NAMES.map((name, index) => (
                <SelectItem key={name} value={String(index + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <span className={labelClass}>Godina</span>
          <Select
            value={parts.year ? String(parts.year) : ''}
            onValueChange={(v) => update({ year: Number(v) })}
            disabled={disabled}
          >
            <SelectTrigger
              ref={yearTriggerRef}
              className={triggerClass}
              aria-label="Godina rođenja"
              data-testid="select-dob-year"
            >
              <SelectValue placeholder="Godina" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {YEARS.map((year) => (
                <SelectItem key={year} value={String(year)}>
                  {year}.
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className={cn('text-xs', isPatient ? 'text-sm text-gray-600' : 'text-gray-500')}>
        {composed
          ? `Izabrano: ${formatDateOfBirth(composed)}`
          : `Izaberite još ${missing.join(', ')} rođenja.`}
      </p>

      {/* The chosen month/year tells the user how many days that month actually has. */}
      {parts.month && parts.year && maxDay < 31 && (
        <p className={cn('text-xs', isPatient ? 'text-sm text-gray-500' : 'text-gray-400')}>
          {MONTH_NAMES[parts.month - 1]} {parts.year}. ima {maxDay} dana.
        </p>
      )}
    </div>
  );
}