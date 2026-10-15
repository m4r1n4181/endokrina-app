import { useState } from 'react';
import { useStaffAuth } from '@/hooks/use-staff-auth';
import { StaffLayout, PageHeader } from '@/components/layout/staff-layout';
import { EmptyState } from '@/components/empty-state';
import { AppointmentStatusBadge, LabStatusBadge, LabsWarningBadge } from '@/components/status-badges';
import type { ReactNode } from 'react';
import { AnswersPanel } from '@/components/answers-panel';
import {
  useGetPatientHistory,
  useGetAppointment,
  useGetDoctorDocuments,
  getGetAppointmentQueryKey,
} from '@workspace/api-client-react';
import { useParams, Link } from 'wouter';
import { differenceInYears, format } from 'date-fns';
import { srLatn } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { appointmentTypeLabel, sexLabel } from '@/lib/labels';
import { normalizePersonName } from '@/lib/person-name';
import { CalendarDays, ChevronDown, FileText, Lock } from 'lucide-react';

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Prior questionnaire snapshot + prior uploaded documents for one historical appointment.
 * Loaded lazily (only when the timeline entry is expanded) through the existing doctor
 * endpoints, so opening the history page does not trigger a request per appointment.
 */
function AppointmentSnapshot({ appointmentId }: { appointmentId: string }) {
  const { data: appointment, isLoading } = useGetAppointment(appointmentId, {
    query: { enabled: !!appointmentId, queryKey: getGetAppointmentQueryKey(appointmentId) },
  });

  const { data: documentsData, isLoading: documentsLoading } = useGetDoctorDocuments(appointmentId, {
    query: { enabled: !!appointmentId, queryKey: ['appointmentDocuments', appointmentId] },
  });

  const answers = appointment?.questionnaire?.answers as Record<string, unknown> | undefined;
  const documents = documentsData?.documents ?? [];

  if (isLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-3 text-lg font-semibold">Odgovori iz upitnika</h3>
        <AnswersPanel answers={answers} showReadOnlyHint={false} />
      </div>

      <div>
        <h3 className="mb-3 text-lg font-semibold">Priloženi dokumenti</h3>
        {documentsLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : documents.length === 0 ? (
          <p className="text-base text-muted-foreground">Za ovaj pregled pacijent nije dodao dokumente.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="flex min-w-0 items-center gap-2 text-base">
                  <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="break-words">{document.originalFileName}</span>
                </span>
                <span className="text-sm text-muted-foreground">{formatFileSize(document.fileSizeBytes)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Dokumenti se otvaraju na{' '}
          <Link href={`/appointments/${appointmentId}`} className="text-primary underline underline-offset-4">
            stranici tog termina
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

export default function PatientHistory() {
  const { patientId } = useParams();
  const { user } = useStaffAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useGetPatientHistory(patientId || '', {
    query: {
      enabled: !!patientId && user?.role === 'doctor',
      queryKey: ['patientHistory', patientId],
    },
  });

  if (isLoading) {
    return (
      <StaffLayout>
        <div className="space-y-4" aria-busy="true" aria-label="Učitavanje istorije">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-72 max-w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </StaffLayout>
    );
  }

  if (!data?.patient) {
    return (
      <StaffLayout>
        <PageHeader back={{ href: '/dashboard', label: 'Dnevni pregled' }} title="Istorija nije dostupna" />
        <Card>
          <EmptyState
            title="Za ovog pacijenta nema istorije"
            description="Istoriju vidi samo doktor, i to za pacijente sa bar jednim terminom."
          />
        </Card>
      </StaffLayout>
    );
  }

  const { patient, appointments } = data;
  const age = differenceInYears(new Date(), new Date(patient.dateOfBirth));

  return (
    <StaffLayout>
      <PageHeader
        back={{ href: '/dashboard', label: 'Dnevni pregled' }}
        title={normalizePersonName(patient.fullName)}
        description={`${age} godina · ${appointments?.length ?? 0} ${(appointments?.length ?? 0) === 1 ? 'pregled' : 'pregleda'} u sistemu`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="h-fit lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-xl">Podaci o pacijentu</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <InfoRow label="Datum rođenja">{format(new Date(patient.dateOfBirth), 'd. MMMM yyyy.', { locale: srLatn })}</InfoRow>
              <InfoRow label="Pol">{sexLabel(patient.sex)}</InfoRow>
              <InfoRow label="Telefon">{patient.phone || '–'}</InfoRow>
              {patient.createdAt && (
                <InfoRow label="U sistemu od">{format(new Date(patient.createdAt), 'MMMM yyyy.', { locale: srLatn })}</InfoRow>
              )}
            </dl>
          </CardContent>
        </Card>

        <section className="lg:col-span-2" aria-labelledby="timeline-title">
          <h2 id="timeline-title" className="text-xl font-semibold">
            Prethodni pregledi
          </h2>
          <p className="mb-4 mt-1 text-base text-muted-foreground">
            Od najnovijeg. Otkazani termini nisu prikazani.
          </p>

          {!appointments?.length ? (
            <Card>
              <EmptyState icon={CalendarDays} title="Nema zabeleženih pregleda" />
            </Card>
          ) : (
            <ol className="space-y-3">
              {appointments.map((appointment) => {
                const expanded = expandedId === appointment.id;
                const when = new Date(appointment.scheduledAt);
                return (
                  <li key={appointment.id} className="rounded-lg border bg-card">
                    <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between md:px-6">
                      <div className="min-w-0">
                        <Link
                          href={`/appointments/${appointment.id}`}
                          className="text-lg font-semibold text-primary underline-offset-4 hover:underline"
                        >
                          <time dateTime={when.toISOString()}>{format(when, 'd. MMMM yyyy.', { locale: srLatn })}</time>
                        </Link>
                        <p className="text-base text-muted-foreground">
                          {appointmentTypeLabel(appointment.appointmentType)} · {format(when, 'HH:mm')}
                          {appointment.doctor?.fullName ? ` · ${normalizePersonName(appointment.doctor.fullName)}` : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <AppointmentStatusBadge status={appointment.status} />
                        <LabStatusBadge labStatus={appointment.labStatus} />
                        <LabsWarningBadge appointmentType={appointment.appointmentType} labStatus={appointment.labStatus} />
                      </div>
                    </div>

                    <Collapsible open={expanded} onOpenChange={(open) => setExpandedId(open ? appointment.id : null)}>
                      <CollapsibleTrigger asChild>
                        <button
                          type="button"
                          className="flex min-h-11 w-full items-center gap-2 border-t px-4 text-left text-base font-medium text-primary transition-colors hover:bg-muted/50 md:px-6"
                        >
                          <ChevronDown
                            className={`size-5 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`}
                            aria-hidden="true"
                          />
                          {expanded ? 'Sakrij odgovore i dokumente' : 'Prikaži odgovore i dokumente'}
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="border-t px-4 py-5 md:px-6">
                        <AppointmentSnapshot appointmentId={appointment.id} />
                      </CollapsibleContent>
                    </Collapsible>
                  </li>
                );
              })}
            </ol>
          )}

          <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="size-4" aria-hidden="true" />
            Odgovori i dokumenti pacijenta su samo za čitanje.
          </p>
        </section>
      </div>
    </StaffLayout>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-base font-medium">{children}</dd>
    </div>
  );
}
