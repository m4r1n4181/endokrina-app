import { CheckCircle2, Calendar } from 'lucide-react';
import { usePatientAuth } from '@/hooks/use-patient-auth';
import { useGetQuestionnaire } from '@workspace/api-client-react';
import { format } from 'date-fns';
import { srLatn } from 'date-fns/locale';
import { useLocation, useParams } from 'wouter';
import { Button } from '@/components/ui/button';

export default function PrepareDone() {
  const { appointmentId } = usePatientAuth();
  const { token } = useParams();
  const [, setLocation] = useLocation();
  
  const { data } = useGetQuestionnaire(appointmentId || '', {
    query: {
      enabled: !!appointmentId,
      queryKey: ['questionnaire-done', appointmentId],
    }
  });

  return (
    <div className="min-h-screen bg-patient-portal-gradient flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 p-10 text-center">
        <div className="mx-auto w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-8 relative">
          <div className="absolute inset-0 bg-green-100 rounded-full animate-ping opacity-20"></div>
          <CheckCircle2 size={48} className="text-[#185e46]" />
        </div>
        
        <h1 className="text-3xl font-serif text-gray-900 mb-4">Hvala Vam!</h1>
        <p className="text-gray-600 text-lg mb-8">
          Vaša priprema za pregled je uspešno završena i prosleđena doktoru.
        </p>

        {data?.appointment && (
          <div className="bg-gray-50 rounded-2xl p-6 text-left border border-gray-100">
            <h3 className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wider flex items-center gap-2">
              <Calendar size={16} /> Vaš termin
            </h3>
            <p className="text-xl font-medium text-gray-900 mb-1">
              {format(new Date(data.appointment.scheduledAt), 'd. MMMM yyyy.', { locale: srLatn })}
            </p>
            <p className="text-gray-600">
              u {format(new Date(data.appointment.scheduledAt), 'HH:mm')} časova
            </p>
          </div>
        )}

        <div className="mt-8 text-sm text-gray-600 space-y-3 text-left">
          <p className="font-medium text-gray-900">Šta se dešava dalje?</p>
          <ul className="space-y-2">
            <li className="flex gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#185e46]" aria-hidden="true" />
              <span>Doktor vidi vaše odgovore i nalaze pre pregleda i koristi ih za pripremu.</span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#185e46]" aria-hidden="true" />
              <span>
                Do početka pregleda možete se vratiti preko istog linka i ispraviti odgovore ili dodati
                nalaze.
              </span>
            </li>
            <li className="flex gap-2">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#185e46]" aria-hidden="true" />
              <span>Donesite sa sobom nalaze ako ste naveli da ćete ih doneti lično.</span>
            </li>
          </ul>
          <p className="pt-2 text-xs text-gray-500">
            Ovaj formular pomaže doktoru da se pripremi. Ne zamenjuje medicinski pregled ili zvaničnu
            evidenciju klinike.
          </p>
        </div>
        <Button
          variant="outline"
          className="mt-6 w-full rounded-xl py-6 text-base"
          onClick={() => setLocation(`/prepare/${token}/questionnaire`)}
        >
          Vrati se na upitnik radi ispravke
        </Button>
      </div>
    </div>
  );
}
