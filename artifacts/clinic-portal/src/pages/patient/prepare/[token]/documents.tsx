import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { usePatientAuth } from '@/hooks/use-patient-auth';
import { useListDocuments, useUploadDocument, getListDocumentsQueryKey, Document } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileUp, File as FileIcon, CheckCircle2, ChevronRight, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

const LAB_OPTIONS = [
  { value: 'uploaded_digitally', label: 'Otpremio/la sam digitalne nalaze' },
  { value: 'will_bring_physical', label: 'Doneću fizičke nalaze na pregled' },
  { value: 'results_pending', label: 'Nalazi još nisu gotovi' },
  { value: 'no_results_available', label: 'Nemam dostupne nalaze' },
  { value: 'not_required', label: 'Nisu potrebni za ovaj tip pregleda' },
] as const;

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

  const uploadMutation = useUploadDocument();
  const [isUploading, setIsUploading] = useState(false);
  const [labStatus, setLabStatus] = useState<string>('');
  const [labSaving, setLabSaving] = useState(false);

  const documents: Document[] = Array.isArray(documentsData) ? documentsData : [];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !appointmentId) return;

    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
    if (!allowed.includes(file.type) && !file.name.match(/\.(pdf|jpe?g|png)$/i)) {
      toast({ title: 'Nepodržan format', description: 'Dozvoljeni su PDF, JPG i PNG.', variant: 'destructive' });
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';

      setIsUploading(true);
      uploadMutation.mutate(
        {
          appointmentId,
          data: {
            originalFileName: file.name,
            mimeType: file.type || 'application/pdf',
            fileSizeBytes: file.size,
            documentType: 'lab_result',
            fileContentBase64: result,
            labStatus: 'uploaded_digitally',
          },
        },
        {
          onSuccess: () => {
            toast({ title: 'Dokument uspešno dodat' });
            setLabStatus('uploaded_digitally');
            queryClient.invalidateQueries({ queryKey: getListDocumentsQueryKey(appointmentId) });
            setIsUploading(false);
          },
          onError: () => {
            toast({ title: 'Greška pri otpremanju', variant: 'destructive' });
            setIsUploading(false);
          },
        }
      );
    };

    reader.onerror = () => {
      toast({ title: 'Greška pri čitanju fajla', variant: 'destructive' });
    };

    reader.readAsDataURL(file);
  };

  const saveLabStatus = async (value: string) => {
    if (!appointmentId) return;
    setLabStatus(value);
    setLabSaving(true);
    try {
      const res = await fetch(`/api/uploads/${appointmentId}/lab-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ labStatus: value }),
      });
      if (!res.ok) throw new Error('failed');
      toast({ title: 'Status nalaza sačuvan' });
    } catch {
      toast({ title: 'Greška', description: 'Nije moguće sačuvati status nalaza.', variant: 'destructive' });
    } finally {
      setLabSaving(false);
    }
  };

  const handleFinish = async () => {
    if (!labStatus && documents.length === 0) {
      toast({
        title: 'Izaberite status nalaza',
        description: 'Možete nastaviti i bez otpremanja — samo izaberite jednu opciju ispod.',
        variant: 'destructive',
      });
      return;
    }
    if (labStatus && labStatus !== 'uploaded_digitally') {
      await saveLabStatus(labStatus);
    }
    setLocation(`/prepare/${token}/done`);
  };

  const showStrongWarning =
    labStatus === 'no_results_available' || labStatus === 'results_pending' || (!labStatus && documents.length === 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-28 pt-8">
      <main className="max-w-2xl mx-auto px-4">
        <div className="mb-8">
          <h2 className="text-3xl font-serif text-[#185e46] mb-3">Laboratorijski nalazi</h2>
          <p className="text-gray-600 text-lg">
            Otpremite nalaze ili izaberite status. Nedostajući nalazi ne sprečavaju slanje pripreme.
          </p>
        </div>

        {showStrongWarning && (
          <Alert className="mb-6 border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-700" />
            <AlertTitle className="text-amber-900">Upozorenje o nalazima</AlertTitle>
            <AlertDescription className="text-amber-800">
              Za ovaj tip pregleda obično su potrebni skoriji laboratorijski nalazi. Bez njih, doktor možda neće moći da završi kompletnu procenu. Možete nastaviti ako dolazite iz drugog razloga ili ćete nalaze doneti lično.
            </AlertDescription>
          </Alert>
        )}

        <div className="bg-white border-2 border-dashed border-[#185e46]/20 rounded-3xl p-8 text-center mb-8 hover:bg-[#185e46]/5 transition-colors relative">
          <input
            type="file"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={handleFileUpload}
            disabled={isUploading || uploadMutation.isPending}
            accept=".pdf,.jpg,.jpeg,.png"
          />
          <div className="w-16 h-16 bg-[#185e46]/10 text-[#185e46] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <FileUp size={32} />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-1">Dodirnite da dodate dokument</h3>
          <p className="text-sm text-gray-500">PDF, JPG, PNG (maksimalno 20MB)</p>

          {(isUploading || uploadMutation.isPending) && (
            <div className="mt-4 flex items-center justify-center gap-2 text-[#185e46]">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
              <span>Otpremanje...</span>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border p-6 mb-8">
          <h3 className="font-medium text-gray-900 mb-4">Status nalaza</h3>
          <RadioGroup value={labStatus} onValueChange={saveLabStatus} className="space-y-3">
            {LAB_OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-center space-x-3 min-h-11">
                <RadioGroupItem value={opt.value} id={opt.value} disabled={labSaving} />
                <Label htmlFor={opt.value} className="font-normal cursor-pointer text-base">
                  {opt.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="space-y-3">
          <h3 className="font-medium text-gray-900 px-2">Dodati dokumenti</h3>

          {isLoading ? (
            <Skeleton className="h-20 w-full rounded-2xl" />
          ) : documents.length > 0 ? (
            documents.map((doc) => (
              <div key={doc.id} className="bg-white p-4 rounded-2xl border flex items-center gap-4 shadow-sm">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                  <FileIcon size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{doc.originalFileName}</p>
                  <p className="text-sm text-gray-500">{(doc.fileSizeBytes / 1024 / 1024).toFixed(2)} MB</p>
                </div>
                <CheckCircle2 className="text-green-500 shrink-0" size={24} />
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-400 bg-white rounded-2xl border border-gray-100">
              Još niste dodali nijedan dokument.
            </div>
          )}
        </div>
      </main>

      <footer className="fixed bottom-0 w-full bg-white border-t p-4 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <div className="max-w-2xl mx-auto flex justify-end">
          <Button onClick={handleFinish} className="bg-[#185e46] hover:bg-[#124a37] rounded-xl px-8 py-6 text-lg w-full sm:w-auto min-h-12">
            Završi pripremu <ChevronRight size={20} className="ml-2" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
