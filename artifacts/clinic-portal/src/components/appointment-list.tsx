/**
 * List of appointments in one framed panel with hairline rows (dashboard, upcoming, past).
 *
 * Phone: time on the left; full patient name (wraps, never truncated), type, then badges
 * on their own line. Desktop: one row per appointment — time | patient | statuses | chevron.
 */
import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { format, isThisYear } from 'date-fns';
import { srLatn } from 'date-fns/locale';
import { ChevronRight } from 'lucide-react';
import type { Appointment } from '@workspace/api-client-react';

import { AppointmentStatusBadge, LabStatusBadge, LabsWarningBadge } from '@/components/status-badges';
import { appointmentTypeLabel } from '@/lib/labels';
import { normalizePersonName } from '@/lib/person-name';
import { Skeleton } from '@/components/ui/skeleton';

export function ListFrame({ children, header }: { children: ReactNode; header?: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {header}
      {children}
    </div>
  );
}

function ColumnHeader() {
  return (
    <div className="hidden grid-cols-[5.5rem_minmax(0,1fr)_auto_1.25rem] gap-x-6 border-b bg-muted/60 px-6 py-2.5 text-sm font-medium text-muted-foreground md:grid">
      <span>Vreme</span>
      <span>Pacijent</span>
      <span className="text-right">Priprema i nalazi</span>
      <span />
    </div>
  );
}

function WhenCell({ date, showDate }: { date: Date; showDate: boolean }) {
  const time = format(date, 'HH:mm');
  if (!showDate) {
    return (
      <time dateTime={date.toISOString()} className="text-xl font-semibold leading-tight text-foreground">
        {time}
      </time>
    );
  }
  const day = format(date, isThisYear(date) ? 'd. MMM' : 'd. MMM yyyy.', { locale: srLatn });
  return (
    <time dateTime={date.toISOString()} className="flex flex-col leading-tight">
      <span className="text-base font-semibold text-foreground">{day}</span>
      <span className="text-base text-muted-foreground">{time}</span>
    </time>
  );
}

export function AppointmentRow({
  appointment,
  showDate = false,
  showDoctor = false,
}: {
  appointment: Appointment;
  showDate?: boolean;
  showDoctor?: boolean;
}) {
  const scheduledAt = new Date(appointment.scheduledAt);
  const doctorName = showDoctor && appointment.doctor?.fullName ? normalizePersonName(appointment.doctor.fullName) : null;

  return (
    <li>
      <Link
        href={`/appointments/${appointment.id}`}
        className="group grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 px-4 py-4 transition-colors duration-150 hover:bg-muted/50 focus-visible:bg-muted/50 md:grid-cols-[5.5rem_minmax(0,1fr)_auto_1.25rem] md:items-center md:gap-x-6 md:px-6"
      >
        <WhenCell date={scheduledAt} showDate={showDate} />

        <div className="min-w-0">
          <p className="break-words text-lg font-semibold leading-snug text-foreground">
            {normalizePersonName(appointment.invitedFullName)}
          </p>
          <p className="mt-0.5 text-base text-muted-foreground">
            {appointmentTypeLabel(appointment.appointmentType)}
            {doctorName && <> · {doctorName}</>}
          </p>
        </div>

        <div className="col-start-2 flex flex-wrap gap-2 md:col-start-auto md:justify-end">
          <AppointmentStatusBadge status={appointment.status} />
          <LabStatusBadge labStatus={appointment.labStatus} />
          <LabsWarningBadge appointmentType={appointment.appointmentType} labStatus={appointment.labStatus} />
        </div>

        <ChevronRight
          className="hidden size-5 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 md:block"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

export function AppointmentList({
  appointments,
  showDate = false,
  showDoctor = false,
}: {
  appointments: Appointment[];
  showDate?: boolean;
  showDoctor?: boolean;
}) {
  return (
    <ListFrame header={<ColumnHeader />}>
      <ul className="divide-y">
        {appointments.map((appointment) => (
          <AppointmentRow key={appointment.id} appointment={appointment} showDate={showDate} showDoctor={showDoctor} />
        ))}
      </ul>
    </ListFrame>
  );
}

export function AppointmentListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ListFrame header={<ColumnHeader />}>
      <ul className="divide-y" aria-busy="true" aria-label="Učitavanje termina">
        {Array.from({ length: rows }, (_, index) => (
          <li key={index} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 px-4 py-4 md:grid-cols-[5.5rem_minmax(0,1fr)] md:px-6">
            <Skeleton className="h-6 w-14" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48 max-w-full" />
              <Skeleton className="h-5 w-32" />
            </div>
          </li>
        ))}
      </ul>
    </ListFrame>
  );
}
