import { CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { srLatn } from 'date-fns/locale';
import { useLocation, useParams } from 'wouter';
import { usePatientAuth } from '@/hooks/use-patient-auth';
import { useGetQuestionnaire } from '@workspace/api-client-react';

import { Button } from '@/components/ui/button';
import { PatientCard, PatientShell, PatientTitle } from '@/components/layout/patient-shell';
import { PrepGuidanceList } from '@/components/prep-guidance';
import { appointmentTypeLabel } from '@/lib/labels';

export default function PrepareDone() {
  const { appointmentId } = usePatientAuth();
  const { token } = useParams();
  const [, setLocation] = useLocation();

  const { data } = useGetQuestionnaire(appointmentId || '', {
    query: { enabled: !!appointmentId, queryKey: ['questionnaire-done', appointmentId] },
  });

  const appointment = data?.appointment;
  const scheduledAt = appointment ? new Date(appointment.scheduledAt) : null;
  const day = scheduledAt ? format(scheduledAt, 'EEEE, d. MMMM yyyy.', { locale: srLatn }) : '';

  return (
    <PatientShell>
      <PatientCard>
        <CheckCircle2 className="mb-4 size-10 text-success" aria-hidden="true" />
        <PatientTitle>Hvala, priprema je poslata</PatientTitle>
        <p className="mt-3">Vaš doktor će pregledati odgovore i nalaze pre pregleda.</p>

        {scheduledAt && (
          <dl className="mt-6 rounded-lg border px-5 py-4">
            <dt className="text-base text-muted-foreground">Vaš termin</dt>
            <dd className="mt-1 text-xl font-semibold">
              <time dateTime={scheduledAt.toISOString()}>
                {day.charAt(0).toUpperCase() + day.slice(1)} u {format(scheduledAt, 'HH:mm')}
              </time>
            </dd>
            <dd className="text-base text-muted-foreground">{appointmentTypeLabel(appointment?.appointmentType)}</dd>
          </dl>
        )}

        <PrepGuidanceList appointmentType={appointment?.appointmentType} title="Ponesite na pregled" className="mt-6" />

        <section className="mt-8" aria-labelledby="next-title">
          <h2 id="next-title" className="text-xl font-semibold">
            Ako treba nešto da promenite
          </h2>
          <p className="mt-2 text-muted-foreground">
            Do početka pregleda možete se vratiti preko istog linka iz emaila, ispraviti odgovore ili dodati nalaze.
          </p>
          <Button
            variant="outline"
            size="lg"
            className="mt-4 w-full"
            onClick={() => setLocation(`/prepare/${token}/questionnaire`)}
          >
            Izmeni odgovore
          </Button>
        </section>
      </PatientCard>
    </PatientShell>
  );
}
