import { useLocation, useParams } from 'wouter';
import { format } from 'date-fns';
import { srLatn } from 'date-fns/locale';
import { usePatientAuth } from '@/hooks/use-patient-auth';
import { useGetQuestionnaire, useRecordConsent } from '@workspace/api-client-react';

import { Button } from '@/components/ui/button';
import { PatientCard, PatientShell, PatientTitle } from '@/components/layout/patient-shell';
import { PrepGuidanceList } from '@/components/prep-guidance';
import { appointmentTypeLabel } from '@/lib/labels';
import { useToast } from '@/hooks/use-toast';

const DATA_USE = [
  'Vaše odgovore i nalaze vidi samo vaš doktor, pre pregleda.',
  'Osoblje na prijemu vidi samo da li ste završili pripremu — ne vidi vaše odgovore.',
  'Podaci se koriste samo za pripremu ovog pregleda i čuvaju se po pravilima privatnosti klinike.',
  'U svakom trenutku možete tražiti uvid, ispravku ili brisanje podataka i povući saglasnost — dovoljno je da pozovete kliniku.',
];

export default function PrepareConsent() {
  const { token } = useParams();
  const [, setLocation] = useLocation();
  const { appointmentId } = usePatientAuth();
  const consentMutation = useRecordConsent();
  const { toast } = useToast();

  const { data } = useGetQuestionnaire(appointmentId || '', {
    query: { enabled: !!appointmentId, queryKey: ['questionnaire', appointmentId] },
  });
  const appointment = data?.appointment;
  const scheduledAt = appointment ? new Date(appointment.scheduledAt) : null;
  const day = scheduledAt ? format(scheduledAt, 'EEEE, d. MMMM', { locale: srLatn }) : '';

  const handleAccept = () => {
    if (!appointmentId) return;
    consentMutation.mutate(
      { appointmentId, data: { consentVersion: 'v1' } },
      {
        onSuccess: () => setLocation(`/prepare/${token}/questionnaire`),
        onError: () =>
          toast({
            title: 'Saglasnost nije sačuvana',
            description: 'Proverite internet vezu i pokušajte ponovo.',
            variant: 'destructive',
          }),
      }
    );
  };

  return (
    <PatientShell>
      <PatientCard>
        <PatientTitle>Pre nego što počnete</PatientTitle>
        {scheduledAt && (
          <p className="mt-2 font-medium text-foreground">
            {appointmentTypeLabel(appointment?.appointmentType)} · {day.charAt(0).toUpperCase() + day.slice(1)} u{' '}
            {format(scheduledAt, 'HH:mm')}
          </p>
        )}
        <p className="mt-3 text-muted-foreground">
          Kratak upitnik pomaže vašem doktoru da se pripremi za pregled. Traje oko 10 minuta, a možete ga sačuvati i
          završiti kasnije preko istog linka.
        </p>

        <PrepGuidanceList appointmentType={appointment?.appointmentType} className="mt-6" />

        <section className="mt-8" aria-labelledby="data-use-title">
          <h2 id="data-use-title" className="text-xl font-semibold">
            Kako koristimo vaše podatke
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-6 marker:text-muted-foreground">
            {DATA_USE.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <Button size="xl" className="mt-8 w-full" onClick={handleAccept} disabled={consentMutation.isPending}>
          {consentMutation.isPending ? 'Čuvam…' : 'Razumem, počni upitnik'}
        </Button>
      </PatientCard>
    </PatientShell>
  );
}
