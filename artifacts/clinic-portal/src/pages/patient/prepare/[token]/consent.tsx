import { useLocation, useParams } from 'wouter';
import { usePatientAuth } from '@/hooks/use-patient-auth';
import { useRecordConsent } from '@workspace/api-client-react';

import { Button } from '@/components/ui/button';
import { CheckCircle, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function PrepareConsent() {
  const { token } = useParams();
  const [, setLocation] = useLocation();
  const { appointmentId } = usePatientAuth();
  const consentMutation = useRecordConsent();
  const { toast } = useToast();

  const handleAccept = () => {
    if (!appointmentId) return;
    consentMutation.mutate(
      { appointmentId, data: { consentVersion: 'v1' } },
      {
        onSuccess: () => {
          setLocation(`/prepare/${token}/questionnaire`);
        },
        onError: () => {
          toast({ title: 'Greška', description: 'Nije moguće sačuvati saglasnost.', variant: 'destructive' });
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-patient-portal-gradient flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-blue-50 text-blue-700 rounded-2xl">
            <ShieldAlert size={28} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-serif text-gray-900 leading-tight">
            Pre nego što počnete
          </h1>
        </div>

        <div className="space-y-4 text-base leading-relaxed text-gray-700">
          <p className="text-lg">
            Ovaj formular pomaže vašem doktoru da se pripremi za pregled. On ne zamenjuje medicinski
            pregled ili zvaničnu evidenciju klinike.
          </p>

          <p>
            Kada popunite upitnik, vaše odgovore i (ako ih dodate) nalaze vidi vaš doktor pre pregleda.
            Osoblje klinike vidi samo da je priprema popunjena — ne vidi vaše odgovore.
          </p>

          <ul className="space-y-3">
            <li className="flex items-start gap-3">
              <CheckCircle className="text-[#185e46] mt-0.5 shrink-0" size={20} aria-hidden="true" />
              <span>Podaci se koriste samo za pripremu ovog pregleda i čuvaju se po politici privatnosti klinike.</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="text-[#185e46] mt-0.5 shrink-0" size={20} aria-hidden="true" />
              <span>Možete dobiti podsetnik za termin (SMS, Viber ili email).</span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="text-[#185e46] mt-0.5 shrink-0" size={20} aria-hidden="true" />
              <span>
                U svakom trenutku možete tražiti uvid, ispravku ili brisanje svojih podataka i povući ovu
                saglasnost — dovoljno je da pozovete kliniku.
              </span>
            </li>
            <li className="flex items-start gap-3">
              <CheckCircle className="text-[#185e46] mt-0.5 shrink-0" size={20} aria-hidden="true" />
              <span>
                Ako sistem prepozna datum sa nalaza, to služi samo da vas upozorimo da nalaz možda nije
                skoriji — to nije medicinsko tumačenje.
              </span>
            </li>
          </ul>
        </div>

        <div className="mt-8 border-t pt-6">
          <Button
            className="w-full text-lg py-7 bg-[#185e46] hover:bg-[#124a37] text-white rounded-xl"
            onClick={handleAccept}
            disabled={consentMutation.isPending}
          >
            {consentMutation.isPending ? 'Čuvam...' : 'Razumem i prihvatam'}
          </Button>
          <p className="mt-3 text-center text-sm text-gray-500">
            Nastavljate na kratak upitnik. Možete ga sačuvati i završiti kasnije.
          </p>
        </div>
      </div>
    </div>
  );
}
