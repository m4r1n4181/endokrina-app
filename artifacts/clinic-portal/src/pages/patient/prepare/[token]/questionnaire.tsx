import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useParams } from 'wouter';
import { usePatientAuth } from '@/hooks/use-patient-auth';
import { useGetQuestionnaire, useSaveQuestionnaire, useSubmitQuestionnaire } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ChevronRight, ChevronLeft, Save, FileText, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

type QuestionType = 'single_choice' | 'multi_choice' | 'free_text' | 'medication_list' | 'boolean' | 'date';

interface Question {
  id: string;
  type: QuestionType;
  label: string;
  required: boolean;
  options?: { value: string; label: string }[];
  conditional?: { parentQuestionId: string; showWhen: string | string[] };
  hint?: string;
  mustConfirm?: boolean;
}

interface SchemaSection {
  id: string;
  title: string;
  questions: Question[];
}

interface QuestionnaireSchema {
  version: string;
  condition: string;
  sections: SchemaSection[];
}

type MedRow = { name: string; dose: string; frequency: string };

async function fetchSchema(): Promise<QuestionnaireSchema> {
  const res = await fetch('/api/questionnaires/schema');
  if (!res.ok) throw new Error('Schema load failed');
  return res.json();
}

function shouldShow(q: Question, answers: Record<string, unknown>): boolean {
  if (!q.conditional) return true;
  const parent = answers[q.conditional.parentQuestionId];
  const when = q.conditional.showWhen;
  const expected = Array.isArray(when) ? when : [when];
  const normalized = parent === true ? 'true' : parent === false ? 'false' : String(parent ?? '');
  return expected.includes(normalized);
}

export default function PrepareQuestionnaire() {
  const { token } = useParams();
  const [, setLocation] = useLocation();
  const { appointmentId } = usePatientAuth();
  const { toast } = useToast();

  const [currentSectionIdx, setCurrentSectionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

  const { data: schema, isLoading: schemaLoading } = useQuery({
    queryKey: ['questionnaire-schema'],
    queryFn: fetchSchema,
  });

  const { data, isLoading } = useGetQuestionnaire(appointmentId || '', {
    query: {
      enabled: !!appointmentId,
      queryKey: ['questionnaire', appointmentId],
    },
  });

  const saveMutation = useSaveQuestionnaire();
  const submitMutation = useSubmitQuestionnaire();

  const initRef = useRef(false);
  useEffect(() => {
    if (data?.questionnaire?.answers && !initRef.current) {
      const raw = data.questionnaire.answers as Record<string, unknown>;
      // Flatten legacy nested section answers if present
      const flat: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && schema?.sections.some((s) => s.id === k)) {
          Object.assign(flat, v as Record<string, unknown>);
        } else {
          flat[k] = v;
        }
      }
      setAnswers(flat);
      initRef.current = true;
    }
  }, [data, schema]);

  const sections = schema?.sections ?? [];
  const currentSection = sections[currentSectionIdx];

  const visibleQuestions = useMemo(() => {
    if (!currentSection) return [];
    return currentSection.questions.filter((q) => shouldShow(q, answers));
  }, [currentSection, answers]);

  const setAnswer = (key: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!appointmentId) return;
    try {
      await saveMutation.mutateAsync({ appointmentId, data: { answers } });
      toast({ title: 'Sačuvano', description: 'Možete se vratiti i nastaviti kasnije.' });
    } catch {
      toast({ title: 'Greška pri čuvanju', variant: 'destructive' });
    }
  };

  const handleNext = async () => {
    if (!appointmentId) return;
    try {
      await saveMutation.mutateAsync({ appointmentId, data: { answers } });
    } catch {
      toast({ title: 'Greška pri čuvanju', variant: 'destructive' });
      return;
    }

    if (currentSectionIdx < sections.length - 1) {
      setCurrentSectionIdx((idx) => idx + 1);
      window.scrollTo(0, 0);
      return;
    }

    submitMutation.mutate(
      { appointmentId, data: { answers } },
      {
        onSuccess: () => setLocation(`/prepare/${token}/documents`),
        onError: () => toast({ title: 'Greška pri slanju', variant: 'destructive' }),
      }
    );
  };

  const handlePrev = async () => {
    if (appointmentId) {
      try {
        await saveMutation.mutateAsync({ appointmentId, data: { answers } });
      } catch {
        /* ignore */
      }
    }
    if (currentSectionIdx > 0) {
      setCurrentSectionIdx((idx) => idx - 1);
      window.scrollTo(0, 0);
    }
  };

  if (isLoading || schemaLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4 pt-12">
        <div className="max-w-3xl mx-auto">
          <Skeleton className="h-96 w-full rounded-3xl" />
        </div>
      </div>
    );
  }

  if (data?.isLocked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md bg-white p-8 rounded-3xl text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-16 w-16 text-green-500 mb-4" />
          <h2 className="text-2xl font-serif text-gray-900 mb-2">Upitnik je zaključan</h2>
          <p className="text-gray-600 mb-6">
            Ovaj upitnik je zaključan jer je vreme pregleda počelo. Kontaktirajte kliniku ako je nešto važno potrebno ispraviti.
          </p>
          <Button className="w-full bg-[#185e46]" onClick={() => setLocation(`/prepare/${token}/documents`)}>
            Nastavi na dokumenta
          </Button>
        </div>
      </div>
    );
  }

  if (!currentSection) {
    return <div className="p-8 text-center text-gray-500">Upitnik nije dostupan.</div>;
  }

  const renderQuestion = (q: Question) => {
    const val = answers[q.id];

    return (
      <div key={q.id} className="mb-6 bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
        <Label className="text-base font-medium text-gray-800 mb-1 block">{q.label}</Label>
        {q.hint && <p className="text-sm text-gray-500 mb-3">{q.hint}</p>}
        {q.mustConfirm && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-3">
            Prošli put ste naveli da uzimate ovaj lek. Da li ga i dalje uzimate u istoj dozi? Potvrdite, izmenite ili uklonite.
          </p>
        )}

        {(q.type === 'free_text' || q.type === 'date') && (
          q.type === 'date' || ['full_name', 'height_cm'].includes(q.id) ? (
            <Input
              type={q.type === 'date' ? 'date' : 'text'}
              value={(val as string) || ''}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              className="bg-gray-50 text-base py-6"
            />
          ) : (
            <Textarea
              value={(val as string) || ''}
              onChange={(e) => setAnswer(q.id, e.target.value)}
              rows={4}
              className="bg-gray-50 text-base"
            />
          )
        )}

        {q.type === 'boolean' && (
          <div className="flex items-center gap-3 mt-2">
            <span className="text-sm text-gray-500">Ne</span>
            <Switch checked={val === true} onCheckedChange={(checked) => setAnswer(q.id, checked)} />
            <span className="text-sm font-medium text-gray-900">Da</span>
          </div>
        )}

        {q.type === 'single_choice' && q.options && (
          <RadioGroup
            value={(val as string) || ''}
            onValueChange={(v) => setAnswer(q.id, v)}
            className="flex flex-col gap-3 mt-2"
          >
            {q.options.map((opt) => (
              <div key={opt.value} className="flex items-center space-x-3 min-h-11">
                <RadioGroupItem value={opt.value} id={`${q.id}-${opt.value}`} />
                <Label htmlFor={`${q.id}-${opt.value}`} className="font-normal cursor-pointer text-base">
                  {opt.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        )}

        {q.type === 'multi_choice' && q.options && (
          <div className="flex flex-col gap-3 mt-2">
            {q.options.map((opt) => {
              const selected = Array.isArray(val) && val.includes(opt.value);
              return (
                <label key={opt.value} className="flex items-center gap-3 min-h-11 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-5 w-5"
                    checked={!!selected}
                    onChange={(e) => {
                      const current = Array.isArray(val) ? [...val] : [];
                      if (e.target.checked) setAnswer(q.id, [...current, opt.value]);
                      else setAnswer(q.id, current.filter((x) => x !== opt.value));
                    }}
                  />
                  <span className="text-base">{opt.label}</span>
                </label>
              );
            })}
          </div>
        )}

        {q.type === 'medication_list' && (
          <MedicationListEditor
            value={Array.isArray(val) ? (val as MedRow[]) : []}
            onChange={(rows) => setAnswer(q.id, rows)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[#185e46] font-serif font-medium">
            <FileText size={20} /> Priprema za pregled
          </div>
          <div className="text-sm text-gray-500">
            Korak {currentSectionIdx + 1} od {sections.length}
          </div>
        </div>
        <div className="h-1 w-full bg-gray-100">
          <div
            className="h-full bg-[#185e46] transition-all duration-500 ease-out"
            style={{ width: `${((currentSectionIdx + 1) / sections.length) * 100}%` }}
          />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-8">
        <p className="text-sm text-gray-500 mb-2">
          Podaci su pacijent-prijavljeni (nisu verifikovani klinički nalazi). Ovaj formular ne zamenjuje zvaničnu evidenciju.
        </p>
        <h2 className="text-2xl font-serif text-gray-900 mb-6">{currentSection.title}</h2>
        <div className="space-y-2">{visibleQuestions.map(renderQuestion)}</div>
      </main>

      <footer className="fixed bottom-0 w-full bg-white border-t p-4 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <div className="max-w-3xl mx-auto flex justify-between items-center gap-2">
          <Button variant="outline" onClick={handlePrev} disabled={currentSectionIdx === 0} className="rounded-xl px-6 min-h-12">
            <ChevronLeft size={18} className="mr-2" /> Nazad
          </Button>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleSave} disabled={saveMutation.isPending} className="text-gray-500 hidden sm:flex min-h-12">
              <Save size={18} className="mr-2" /> Sačuvaj
            </Button>
            <Button
              onClick={handleNext}
              disabled={submitMutation.isPending || saveMutation.isPending}
              className="bg-[#185e46] hover:bg-[#124a37] rounded-xl px-8 min-h-12"
            >
              {currentSectionIdx === sections.length - 1
                ? submitMutation.isPending
                  ? 'Slanje...'
                  : 'Završi i pošalji'
                : 'Dalje'}
              {currentSectionIdx !== sections.length - 1 && <ChevronRight size={18} className="ml-2" />}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function MedicationListEditor({ value, onChange }: { value: MedRow[]; onChange: (v: MedRow[]) => void }) {
  const rows = value.length ? value : [{ name: '', dose: '', frequency: '' }];

  const update = (idx: number, patch: Partial<MedRow>) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  };

  return (
    <div className="space-y-3 mt-2">
      {rows.map((row, idx) => (
        <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
          <div>
            <Label className="text-xs text-gray-500">Lek</Label>
            <Input value={row.name} onChange={(e) => update(idx, { name: e.target.value })} className="bg-gray-50" placeholder="npr. Euthyrox" />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Doza</Label>
            <Input value={row.dose} onChange={(e) => update(idx, { dose: e.target.value })} className="bg-gray-50" placeholder="npr. 75 mcg" />
          </div>
          <div>
            <Label className="text-xs text-gray-500">Učestalost</Label>
            <Input value={row.frequency} onChange={(e) => update(idx, { frequency: e.target.value })} className="bg-gray-50" placeholder="npr. 1x dnevno" />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-red-500"
            onClick={() => onChange(rows.filter((_, i) => i !== idx))}
            disabled={rows.length <= 1 && !row.name}
          >
            <Trash2 size={16} />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => onChange([...rows, { name: '', dose: '', frequency: '' }])}
      >
        <Plus size={16} className="mr-2" /> Dodaj lek
      </Button>
    </div>
  );
}
