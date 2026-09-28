import { useState } from 'react';
import { useStaffAuth } from '@/hooks/use-staff-auth';
import { StaffLayout } from '../../dashboard';
import { AppointmentStatusBadge, LabStatusBadge, LabsWarningBadge } from '@/components/status-badges';
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

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { appointmentTypeLabel, sexLabel } from '@/lib/labels';
import { normalizePersonName } from '@/lib/person-name';
import { Activity, ChevronDown, Clock, FileBox, Lock, User } from 'lucide-react';

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
        <h4 className="mb-2 font-serif text-sm font-semibold uppercase tracking-wide text-primary">
          Snimak upitnika
        </h4>
        <AnswersPanel answers={answers} showReadOnlyHint={false} />
      </div>

      <div>
        <h4 className="mb-2 flex items-center gap-2 font-serif text-sm font-semibold uppercase tracking-wide text-primary">
          <FileBox size={14} aria-hidden="true" /> Priloženi dokumenti
        </h4>
        {documentsLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : documents.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-gray-50 p-3 text-sm italic text-gray-500">
            Za ovaj pregled nema otpremljenih dokumenata.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-white">
            {documents.map((document) => (
              <li key={document.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="min-w-0 truncate text-sm text-gray-800">{document.originalFileName}</span>
                <span className="text-xs text-gray-500">{formatFileSize(document.fileSizeBytes)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-gray-500">
          Dokumenti se otvaraju i preuzimaju na{' '}
          <Link href={`/appointments/${appointmentId}`} className="underline">
            stranici termina
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
      <StaffLayout title="Istorija pacijenta">
        <Skeleton className="h-96 w-full" />
      </StaffLayout>
    );
  }

  if (!data?.patient) {
    return (
      <StaffLayout title="Nije pronađeno">
        <p>Istorija pacijenta nije dostupna.</p>
      </StaffLayout>
    );
  }

  const { patient, appointments } = data;
  const age = differenceInYears(new Date(), new Date(patient.dateOfBirth));

  return (
    <StaffLayout title={`Pacijent: ${normalizePersonName(patient.fullName)}`}>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="border-primary/10 lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User size={18} /> Identitet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between gap-3 border-b pb-2">
              <span className="text-gray-500">Datum rođenja:</span>
              <span className="text-right font-medium">
                {format(new Date(patient.dateOfBirth), 'PPP', { locale: srLatn })}
                <span className="block text-xs font-normal text-gray-500">{age} godina</span>
              </span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-500">Pol:</span>
              <span className="font-medium">{sexLabel(patient.sex)}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-500">Telefon:</span>
              <span className="font-medium">{patient.phone || '–'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Pregleda u sistemu:</span>
              <span className="font-medium">{appointments?.length ?? 0}</span>
            </div>
            {patient.createdAt && (
              <p className="border-t pt-2 text-xs text-gray-500">
                U sistemu od {format(new Date(patient.createdAt), 'MMM yyyy', { locale: srLatn })}.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity size={18} /> Klinička vremenska linija
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-xs text-gray-500">
              Otkazani termini su isključeni. Za svaki pregled možete otvoriti sačuvane odgovore iz
              upitnika i spisak priloženih dokumenata. Bez grafikona i trendova u MVP verziji.
            </p>

            {!appointments?.length ? (
              <p className="pl-6 text-gray-500">Nema zabeleženih termina.</p>
            ) : (
              <ol className="relative ml-3 space-y-6 border-l border-gray-200 pb-4">
                {appointments.map((appointment) => {
                  const expanded = expandedId === appointment.id;
                  return (
                    <li key={appointment.id} className="relative pl-6">
                      <div
                        className="absolute -left-[6.5px] top-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-white"
                        aria-hidden="true"
                      />
                      <div className="rounded-xl border bg-white p-4 shadow-sm">
                        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link
                              href={`/appointments/${appointment.id}`}
                              className="font-semibold text-primary hover:underline"
                            >
                              {format(new Date(appointment.scheduledAt), 'PPP', { locale: srLatn })}
                            </Link>
                            <p className="text-sm text-gray-600">
                              {appointmentTypeLabel(appointment.appointmentType)}
                            </p>
                          </div>
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <LabsWarningBadge
                              appointmentType={appointment.appointmentType}
                              labStatus={appointment.labStatus}
                            />
                            <LabStatusBadge labStatus={appointment.labStatus} />
                            <AppointmentStatusBadge status={appointment.status} />
                          </div>
                        </div>

                        <p className="flex items-center gap-1 text-sm text-gray-600">
                          <Clock size={14} /> {format(new Date(appointment.scheduledAt), 'HH:mm')}
                          {appointment.doctor?.fullName ? ` • ${normalizePersonName(appointment.doctor.fullName)}` : ''}
                        </p>

                        <Collapsible
                          open={expanded}
                          onOpenChange={(open) => setExpandedId(open ? appointment.id : null)}
                          className="mt-3"
                        >
                          <CollapsibleTrigger asChild>
                            <Button variant="outline" size="sm" className="gap-2">
                              <ChevronDown
                                size={14}
                                className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
                                aria-hidden="true"
                              />
                              {expanded ? 'Sakrij odgovore i dokumente' : 'Prikaži odgovore i dokumente'}
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pt-4">
                            <AppointmentSnapshot appointmentId={appointment.id} />
                          </CollapsibleContent>
                        </Collapsible>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            <p className="mt-4 flex items-center gap-2 text-xs text-gray-500">
              <Lock size={12} aria-hidden="true" />
              Sadržaj je samo za čitanje — odgovori i dokumenti pacijenta se ne mogu menjati.
            </p>
          </CardContent>
        </Card>
      </div>
    </StaffLayout>
  );
}

