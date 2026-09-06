import { useStaffAuth } from '@/hooks/use-staff-auth';
import { StaffLayout, AppointmentStatusBadge } from '../../dashboard';
import { useGetPatientHistory } from '@workspace/api-client-react';
import { useParams, Link } from 'wouter';
import { format } from 'date-fns';
import { srLatn } from 'date-fns/locale';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Clock, User } from 'lucide-react';

export default function PatientHistory() {
  const { patientId } = useParams();
  const { user } = useStaffAuth();

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

  return (
    <StaffLayout title={`Pacijent: ${patient.fullName}`}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="md:col-span-1 border-primary/10">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User size={18} /> Identitet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-500">Datum rođenja:</span>
              <span className="font-medium">{format(new Date(patient.dateOfBirth), 'PPP', { locale: srLatn })}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-500">Pol:</span>
              <span className="font-medium">{patient.sex || '–'}</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-gray-500">Telefon:</span>
              <span className="font-medium">{patient.phone || '–'}</span>
            </div>
            {patient.createdAt && (
              <div className="flex justify-between pb-2">
                <span className="text-gray-500">U sistemu od:</span>
                <span className="font-medium">{format(new Date(patient.createdAt), 'MMM yyyy', { locale: srLatn })}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity size={18} /> Klinička vremenska linija
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-gray-500 mb-4">
              Otkazani termini su isključeni po podrazumevanom. Podaci su pacijent-prijavljeni, ne zvanična evidencija.
            </p>
            <div className="relative border-l border-gray-200 ml-3 space-y-6 pb-4">
              {!appointments?.length ? (
                <p className="pl-6 text-gray-500">Nema zabeleženih termina.</p>
              ) : (
                appointments.map((appt) => (
                  <div key={appt.id} className="relative pl-6">
                    <div className="absolute w-3 h-3 bg-primary rounded-full -left-[6.5px] top-1.5 ring-4 ring-white" />
                    <div className="bg-white border rounded-xl p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-2 gap-2 flex-wrap">
                        <Link href={`/appointments/${appt.id}`} className="hover:underline font-semibold text-primary">
                          {format(new Date(appt.scheduledAt), 'PPP', { locale: srLatn })} — {appt.appointmentType}
                        </Link>
                        <AppointmentStatusBadge status={appt.status} />
                      </div>
                      <p className="text-sm text-gray-600 flex items-center gap-1">
                        <Clock size={14} /> {format(new Date(appt.scheduledAt), 'HH:mm')}
                        {appt.doctor?.fullName ? ` • ${appt.doctor.fullName}` : ''}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </StaffLayout>
  );
}
