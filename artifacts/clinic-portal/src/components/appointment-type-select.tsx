/**
 * Appointment type dropdown — the single place where `appointmentType` is chosen or displayed.
 * Always renders Serbian labels from `src/lib/labels.ts` (never `follow_up` style values).
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { APPOINTMENT_TYPE_LABELS, APPOINTMENT_TYPE_OPTIONS } from '@/lib/labels';
import { cn } from '@/lib/utils';

export function AppointmentTypeSelect({
  value,
  onChange,
  disabled,
  placeholder = 'Izaberite tip',
  className,
  'aria-label': ariaLabel,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <Select
      value={value || undefined}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className={cn(className)} aria-label={ariaLabel ?? 'Tip pregleda'}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {APPOINTMENT_TYPE_OPTIONS.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
        {/* Keeps legacy/unknown types visible instead of silently swapping the value */}
        {value && !APPOINTMENT_TYPE_LABELS[value] && (
          <SelectItem value={value}>{value}</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
