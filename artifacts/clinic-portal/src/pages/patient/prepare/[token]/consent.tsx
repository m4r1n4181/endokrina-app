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
      <div className="max-w-2xl w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 p-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="p-3 bg-blue-50 text-blue-700 rounded-2xl">
            <ShieldAlert size={28} />
          </div>
          <h1 className="text-2xl font-serif text-gray-900">Saglasnost i privatnost</h1>
        </div>

        <div className="prose prose-green max-w-none text-gray-600 mb-6 space-y-4">
          <p>
            Ovaj formular pomaže vašem doktoru da se pripremi za pregled. On ne zamenjuje medicinski pregled ili zvaničnu evidenciju klinike.
          </p>
          <p>
            Popunjavanjem prihvatate da se prikupljaju odgovori iz upitnika i (opciono) dokumenti koje otpremite, kako bi doktor video klinički sadržaj pre pregleda. Administracija klinike vidi samo operativni status (npr. da li je upitnik popunjen), ne i vaše odgovore.
          </p>
          <ul className="space-y-2 list-none pl-0">
            <li className="flex items-start gap-2">
              <CheckCircle className="text-[#185e46] mt-1 shrink-0" size={18} />
              <span>Podaci su namenjeni pripremi za ovaj pregled i čuvaju se u skladu sa politikom privatnosti.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="text-[#185e46] mt-1 shrink-0" size={18} />
              <span>Možete primati podsetnike (SMS/Viber) vezane za ovaj termin.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="text-[#185e46] mt-1 shrink-0" size={18} />
              <span>Imate pravo na uvid, ispravku, brisanje, izvoz i povlačenje saglasnosti — kontaktirajte kliniku.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="text-[#185e46] mt-1 shrink-0" size={18} />
              <span>Automatsko očitavanje datuma sa nalaza (ako je omogućeno) služi samo za upozorenje o starosti nalaza, nije medicinska interpretacija.</span>
            </li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t">
          <Button 
            className="flex-1 text-lg py-6 bg-[#185e46] hover:bg-[#124a37] text-white rounded-xl"
            onClick={handleAccept}
            disabled={consentMutation.isPending}
          >
            {consentMutation.isPending ? 'Čuvam...' : 'Razumem i prihvatam'}
          </Button>
        </div>
      </div>
    </div>
  );
}
