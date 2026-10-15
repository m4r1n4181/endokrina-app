import { useRef, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { usePatientAuth } from '@/hooks/use-patient-auth';
import {
  customFetch,
  useGetQuestionnaire,
  useListDocuments,
  getListDocumentsQueryKey,
  Document,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle2, ChevronLeft, FileUp, LoaderCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { PatientStepShell, PatientTitle } from '@/components/layout/patient-shell';
import { useQuestionnaireSchema } from '@/lib/questionnaire';
import { PrepGuidanceList } from '@/components/prep-guidance';
import { ChoiceRow } from '@/components/choice-row';
import { LAB_STATUS_PATIENT_OPTIONS, expectsLabs } from '@/lib/labels';

const LAB_OPTIONS = LAB_STATUS_PATIENT_OPTIONS;

export default function PrepareDocuments() {
  const { token } = useParams();
  const [, setLocation] = useLocation();
  const { appointmentId } = usePatientAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: documentsData, isLoading } = useListDocuments(appointmentId || '', {
    query: {
      enabled: !!appointmentId,
      queryKey: getListDocumentsQueryKey(appointmentId || ''),
    },
  });

  const { data: questionnaireState } = useGetQuestionnaire(appointmentId || '', {
    query: { enabled: !!appointmentId, queryKey: ['questionnaire', appointmentId] },
  });
  const appointmentType = questionnaireState?.appointment?.appointmentType;
  const labsExpected = expectsLabs(appointmentType);
  const { data: schema } = useQuestionnaireSchema();
  const totalSteps = schema ? schema.sections.length + 1 : undefined;

  const statusRef = useRef<HTMLDivElement>(null);
  const [statusError, setStatusError] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [labStatus, setLabStatus] = useState<string>('');
  const [labSaving, setLabSaving] = useState(false);

  const documents: Document[] = Array.isArray(documentsData) ? documentsData : [];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !appointmentId) return;

    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|jpe?g|png)$/i)) {
      toast({ title: 'Ovaj fajl ne možemo da primimo', description: 'Dodajte fotografiju (JPG, PNG) ili PDF.', variant: 'destructive' });
      e.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('documentType', 'lab_result');
    formData.append('labStatus', 'uploaded_digitally');

    setIsUploading(true);
    customFetch(`/api/uploads/${appointmentId}`, {
      method: 'POST',
      body: formData,
      responseType: 'json',
    })
      .then(() => {
        toast({ title: 'Nalaz je dodat' });
        setLabStatus('uploaded_digitally');
        setStatusError(false);
        queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(appointmentId) });
      })
      .catch((error: any) => {
        const description = error?.data?.code === 'FILE_TOO_LARGE'
          ? 'Fajl je veći od 20 MB. Slikajte nalaz ponovo ili ga sačuvajte kao manji PDF.'
          : error?.data?.code === 'UNSUPPORTED_FILE_TYPE'
            ? 'Dodajte fotografiju (JPG, PNG) ili PDF.'
            : 'Proverite internet vezu i pokušajte ponovo.';
        toast({ title: 'Nalaz nije dodat', description, variant: 'destructive' });
      })
      .finally(() => {
        setIsUploading(false);
        e.target.value = '';
      });
  };

  const saveLabStatus = async (value: string) => {
    if (!appointmentId) return;
    setLabStatus(value);
    setStatusError(false);
    setLabSaving(true);
    try {
      const res = await fetch(`/api/uploads/${appointmentId}/lab-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labStatus: value }),
      });
      if (!res.ok) throw new Error('failed');
    } catch {
      toast({ title: 'Izbor nije sačuvan', description: 'Proverite internet vezu i izaberite ponovo.', variant: 'destructive' });
    } finally {
      setLabSaving(false);
    }
  };

  const handleFinish = async () => {
    if (!labStatus && documents.length === 0) {
      setStatusError(true);
      statusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (labStatus && labStatus !== 'uploaded_digitally') {
      await saveLabStatus(labStatus);
    }
    setLocation(`/prepare/${token}/done`);
  };

  const hasDocuments = documents.length > 0;
  const missingLabs =
    labsExpected && !hasDocuments && (labStatus === 'no_results_available' || labStatus === 'results_pending');
  const options = LAB_OPTIONS.filter((opt) => opt.value !== 'uploaded_digitally' || hasDocuments);

  return (
    <PatientStepShell
      step={totalSteps}
      totalSteps={totalSteps}
      actions={
        <>
          <Button
            variant="outline"
            size="xl"
            className="px-4"
            onClick={() => setLocation(`/prepare/${token}/questionnaire`)}
            aria-label="Nazad na upitnik"
          >
            <ChevronLeft aria-hidden="true" />
            <span className="hidden sm:inline">Upitnik</span>
          </Button>
          <Button size="xl" className="flex-1" onClick={handleFinish} disabled={labSaving || isUploading}>
            Završi pripremu
          </Button>
        </>
      }
    >
      <section className="rounded-xl border bg-card px-5 py-6 sm:px-8 sm:py-8">
        <PatientTitle>Laboratorijski nalazi</PatientTitle>
        <p className="mt-2 text-muted-foreground">
          Dodajte nalaze ako ih imate — slika telefonom je dovoljna. Ako ih nemate, samo izaberite šta važi za vas. Pripremu
          možete završiti u svakom slučaju.
        </p>

        <PrepGuidanceList appointmentType={appointmentType} title="Šta je potrebno za ovaj pregled" showFootnote={false} className="mt-6" />

        <div className="mt-8">
          <h2 className="text-xl font-semibold">Dodajte nalaz</h2>
          <label
            htmlFor="lab-file"
            className="mt-3 flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-input bg-card px-6 py-6 text-center transition-colors duration-150 hover:border-primary hover:bg-primary-soft/40 has-[:focus-visible]:border-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring"
          >
            {isUploading ? (
              <>
                <LoaderCircle className="size-8 animate-spin text-primary" aria-hidden="true" />
                <span className="mt-3 font-medium">Dodajem nalaz…</span>
              </>
            ) : (
              <>
                <FileUp className="size-8 text-primary" aria-hidden="true" />
                <span className="mt-3 font-semibold text-primary">Izaberite fotografiju ili PDF</span>
                <span className="mt-1 text-base text-muted-foreground">JPG, PNG ili PDF, do 20 MB. Možete dodati više nalaza, jedan po jedan.</span>
              </>
            )}
            <input
              id="lab-file"
              type="file"
              className="sr-only"
              onChange={handleFileUpload}
              disabled={isUploading}
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            />
          </label>
          <p className="mt-3 text-base text-muted-foreground">
            Savet: slikajte nalaz na dnevnom svetlu, ceo list, tako da se tekst jasno vidi i nema odsjaja.
          </p>

          {isLoading ? (
            <Skeleton className="mt-4 h-16 w-full" />
          ) : (
            hasDocuments && (
              <ul className="mt-4 divide-y rounded-lg border" aria-label="Dodati nalazi">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
                    <CheckCircle2 className="size-6 shrink-0 text-success" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="break-words font-medium">{doc.originalFileName}</p>
                      <p className="text-base text-muted-foreground">
                        Dodato · {(doc.fileSizeBytes / 1024 / 1024).toFixed(1)} MB
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>

        <div ref={statusRef} className="mt-8" role="group" aria-labelledby="lab-status-title">
          <h2 id="lab-status-title" className="text-xl font-semibold">
            {hasDocuments ? 'Da li ste dodali sve nalaze?' : 'Ako nemate nalaze za dodavanje'}
          </h2>
          <p className="mt-1 text-base text-muted-foreground">
            {hasDocuments ? 'Ako neke nalaze donosite lično, izaberite to ispod.' : 'Izaberite šta važi za vas.'}
          </p>
          <RadioGroup
            value={labStatus}
            onValueChange={saveLabStatus}
            className="mt-3 grid gap-3"
            aria-labelledby="lab-status-title"
            aria-invalid={statusError || undefined}
          >
            {options.map((opt) => (
              <ChoiceRow key={opt.value} id={`lab-${opt.value}`} label={opt.label}>
                <RadioGroupItem value={opt.value} id={`lab-${opt.value}`} disabled={labSaving} />
              </ChoiceRow>
            ))}
          </RadioGroup>
          {statusError && (
            <p className="mt-3 text-base font-medium text-destructive" role="alert">
              Dodajte nalaz ili izaberite jednu od opcija iznad, pa završite pripremu.
            </p>
          )}
        </div>

        {missingLabs && (
          <Alert variant="warning" className="mt-6">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Bez nalaza pregled možda neće biti potpun</AlertTitle>
            <AlertDescription>
              Za ovaj pregled obično su potrebni skoriji nalazi. Bez njih doktor možda neće moći da završi celu procenu.
              Možete nastaviti ako dolazite iz drugog razloga ili ćete nalaze doneti lično.
            </AlertDescription>
          </Alert>
        )}
      </section>
    </PatientStepShell>
  );
}
