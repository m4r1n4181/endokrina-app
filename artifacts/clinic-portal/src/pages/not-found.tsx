import { Link } from 'wouter';
import { PatientCard, PatientShell, PatientTitle } from '@/components/layout/patient-shell';

export default function NotFound() {
  return (
    <PatientShell>
      <PatientCard>
        <PatientTitle>Ova stranica ne postoji</PatientTitle>
        <p className="mt-3 text-muted-foreground">
          Ako ste stigli preko linka iz emaila, otvorite najnoviji email od klinike. Ako ni taj link ne radi, pozovite
          kliniku da vam pošalje novi.
        </p>
      </PatientCard>
      <p className="mt-6 text-base text-muted-foreground">
        Radite u klinici?{' '}
        <Link href="/login" className="font-medium text-primary underline underline-offset-4">
          Prijava za osoblje
        </Link>
      </p>
    </PatientShell>
  );
}
