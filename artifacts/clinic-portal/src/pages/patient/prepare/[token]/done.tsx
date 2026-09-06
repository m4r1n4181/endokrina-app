import { CheckCircle2, Calendar } from 'lucide-react';
import { usePatientAuth } from '@/hooks/use-patient-auth';
import { useGetQuestionnaire } from '@workspace/api-client-react';
import { format } from 'date-fns';

export default function PrepareDone() {
  const { appointmentId } = usePatientAuth();
  
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
              {format(new Date(data.appointment.scheduledAt), 'dd. MMMM yyyy.')}
            </p>
            <p className="text-gray-600">
              u {format(new Date(data.appointment.scheduledAt), 'HH:mm')} časova
            </p>
          </div>
        )}

        <div className="mt-8 text-sm text-gray-500 space-y-2">
          <p>Možete zatvoriti ovaj prozor. Radujemo se vašem dolasku!</p>
          <p className="text-xs">
            Ovaj formular pomaže doktoru da se pripremi. Ne zamenjuje medicinski pregled ili zvaničnu evidenciju klinike.
          </p>
        </div>
      </div>
    </div>
  );
}
