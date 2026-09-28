/**
 * Patient name input with suggestions of patients the clinic already knows about.
 *
 * Data source: the existing `GET /api/appointments` list (already used by the dashboard) —
 * suggestions are grouped by patient and show the phone number and the last appointment.
 * Selecting a suggestion pre-fills the known fields (name, phone, and date of birth when the
 * API returns the linked patient record) so staff do not re-type data that already exists.
 *
 * LIMITATION (backend task, no new endpoint invented here): the list response does not include
 * patient e-mail and, for admin/reception roles, not the date of birth either. A dedicated
 * patient-search endpoint (e.g. `GET /patients?query=`) is needed for a complete pre-fill —
 * until then staff still verifies/enters those two fields manually.
 */
import * as React from 'react';
import { useListAppointments, type Appointment } from '@workspace/api-client-react';
import { cn } from '@/lib/utils';
import { Loader2, UserRoundSearch } from 'lucide-react';
import { normalizePersonName } from '@/lib/person-name';

export interface KnownPatient {
  key: string;
  patientId: string | null;
  fullName: string;
  phone: string;
  dateOfBirth: string | null;
  email: string | null;
  lastAppointmentAt: string;
  appointmentCount: number;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'd')
    .trim();
}

export function useKnownPatients() {
  const { data, isLoading } = useListAppointments(
    {},
    { query: { queryKey: ['appointments', 'known-patients'], staleTime: 60_000 } }
  );

  const patients = React.useMemo<KnownPatient[]>(() => {
    const list: Appointment[] = Array.isArray(data) ? data : [];
    const byKey = new Map<string, KnownPatient>();

    for (const appointment of list) {
      const fullName = appointment.invitedFullName ? normalizePersonName(appointment.invitedFullName) : '';
      const phone = appointment.invitedPhone?.trim() ?? '';
      if (!fullName) continue;

      const key = appointment.patientId || phone || fullName;
      const existing = byKey.get(key);
      const scheduledAt = appointment.scheduledAt;

      if (!existing) {
        byKey.set(key, {
          key,
          patientId: appointment.patientId ?? null,
          fullName,
          phone,
          dateOfBirth: appointment.patient?.dateOfBirth ?? null,
          email: (appointment.patient as (typeof appointment.patient & { email?: string | null }))?.email ?? null,
          lastAppointmentAt: scheduledAt,
          appointmentCount: 1,
        });
        continue;
      }

      existing.appointmentCount += 1;
      if (new Date(scheduledAt) > new Date(existing.lastAppointmentAt)) {
        existing.lastAppointmentAt = scheduledAt;
        existing.fullName = fullName;
        existing.phone = phone || existing.phone;
        existing.dateOfBirth = appointment.patient?.dateOfBirth ?? existing.dateOfBirth;
        existing.email = (appointment.patient as (typeof appointment.patient & { email?: string | null }))?.email ?? existing.email;
      }
    }

    return Array.from(byKey.values()).sort(
      (a, b) => new Date(b.lastAppointmentAt).getTime() - new Date(a.lastAppointmentAt).getTime()
    );
  }, [data]);

  return { patients, isLoading };
}

export function PatientAutocomplete({
  value,
  onChange,
  onSelectPatient,
  disabled,
  placeholder = 'npr. Marija Petrović',
  className,
  id,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  onSelectPatient: (patient: KnownPatient) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  onBlur?: () => void;
}) {
  const { patients, isLoading } = useKnownPatients();
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const query = normalize(value);
  const matches = React.useMemo(() => {
    if (query.length < 2) return [];
    return patients
      .filter(
        (patient) =>
          normalize(patient.fullName).includes(query) || patient.phone.replace(/\D/g, '').includes(query)
      )
      .slice(0, 6);
  }, [patients, query]);

  React.useEffect(() => {
    setActiveIndex(matches.length > 0 ? 0 : -1);
  }, [matches.length]);

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectPatient = (patient: KnownPatient) => {
    onSelectPatient(patient);
    setOpen(false);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || matches.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % matches.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + matches.length) % matches.length);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      selectPatient(matches[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const showSuggestions = open && query.length >= 2;

  return (
    <div className={cn('relative', className)} ref={containerRef}>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={showSuggestions}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        onBlur={onBlur}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      />

      {showSuggestions && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b bg-gray-50 px-3 py-2 text-xs text-gray-500">
            <UserRoundSearch size={14} aria-hidden="true" />
            Postojeći pacijenti iz ranijih termina
            {isLoading && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
          </div>

          {matches.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-500">
              Nema pronađenog pacijenta. Unesite podatke ručno — provera duplikata ostaje na kraju.
            </p>
          ) : (
            <ul role="listbox" className="max-h-64 overflow-y-auto">
              {matches.map((patient, index) => (
                <li key={patient.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectPatient(patient)}
                    className={cn(
                      'flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm',
                      index === activeIndex ? 'bg-blue-50' : 'hover:bg-gray-50'
                    )}
                  >
                    <span className="font-medium text-gray-900">{normalizePersonName(patient.fullName)}</span>
                    <span className="text-xs text-gray-500">
                      {patient.phone ? `${patient.phone} · ` : ''}
                      poslednji termin{' '}
                      {new Date(patient.lastAppointmentAt).toLocaleDateString('sr-Latn-RS')} ·{' '}
                      {patient.appointmentCount}{' '}
                      {patient.appointmentCount === 1 ? 'termin' : 'termina'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <p className="mt-1 text-xs text-gray-500">
        Počnite da kucate ime ili telefon da izaberete postojećeg pacijenta.
      </p>
    </div>
  );
}

