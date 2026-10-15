import { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation, useParams } from 'wouter';
import { usePatientAuth } from '@/hooks/use-patient-auth';
import { useGetQuestionnaire, useSaveQuestionnaire, useSubmitQuestionnaire } from '@workspace/api-client-react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronLeft, ChevronRight, Info, Lock, Plus, Save } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PatientCard, PatientShell, PatientStepShell, PatientTitle } from '@/components/layout/patient-shell';
import { ChoiceRow } from '@/components/choice-row';
import { DateOfBirthField } from '@/components/date-of-birth-field';
import { useToast } from '@/hooks/use-toast';
import { normalizePersonName } from '@/lib/person-name';
import {
  answersForSchema,
  fetchQuestionnaireSchema,
  type MedicationRow,
  type Question,
  type QuestionnaireSchema,
} from '@/lib/questionnaire';

type MedRow = MedicationRow;

function shouldShow(q: Question, answers: Record<string, unknown>): boolean {
  if (!q.conditional) return true;
  const parent = answers[q.conditional.parentQuestionId];
  const when = q.conditional.showWhen;
  const expected = Array.isArray(when) ? when : [when];
  const normalized = parent === true ? 'true' : parent === false ? 'false' : String(parent ?? '');
  return expected.includes(normalized);
}

function hasMedicationAnswers(value: unknown): boolean {
  return Array.isArray(value) && value.some((row) => {
    if (!row || typeof row !== 'object') return false;
    const medication = row as Partial<MedRow>;
    return Boolean(medication.name || medication.dose || medication.frequency);
  });
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
    queryFn: fetchQuestionnaireSchema,
    staleTime: 30 * 60 * 1000,
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
    if (initRef.current) return;

    const questionnaireAnswers = data?.questionnaire?.answers as Record<string, unknown> | undefined;
    if (questionnaireAnswers && Object.keys(questionnaireAnswers).length > 0) {
      // postojeća logika ostaje ista (flatten legacy nested answers)
      const raw = questionnaireAnswers;
      const flat: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(raw)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && schema?.sections.some((s) => s.id === k)) {
          Object.assign(flat, v);
        } else {
          flat[k] = v;
        }
      }
      const mergedAnswers = { ...(data?.prefill as Record<string, unknown> | null ?? {}), ...flat };
      if (typeof mergedAnswers.full_name === 'string') {
        mergedAnswers.full_name = normalizePersonName(mergedAnswers.full_name);
      }
      setAnswers(mergedAnswers);
      initRef.current = true;
    } else if (data?.prefill && schema) {
      // nov upitnik za ovaj appointment, ali pacijent je vraćajući —
      // predlaži samo prefillable polja, pacijent i dalje može da ih izmeni
      const prefilledAnswers = { ...(data.prefill as Record<string, unknown>) };
      if (typeof prefilledAnswers.full_name === 'string') {
        prefilledAnswers.full_name = normalizePersonName(prefilledAnswers.full_name);
      }
      setAnswers(prefilledAnswers);
      initRef.current = true;
    }
  }, [data, schema]);

  const sections = schema?.sections ?? [];
  const currentSection = sections[currentSectionIdx];
  const hasPrefilledProfile = Boolean(data?.prefill && Object.keys(data.prefill).length > 0);
  const hasExistingProfile = ['full_name', 'date_of_birth', 'sex'].some((key) => key in answers);
  const profilePrefilled = hasPrefilledProfile || hasExistingProfile;
  const currentSectionTitle = currentSection?.id === 'stable_profile' ? 'Lični podaci' : currentSection?.title;
  const hasPreviousMedication = Boolean(
    hasMedicationAnswers(data?.questionnaire?.answers?.current_thyroid_therapy) ||
    hasMedicationAnswers(data?.questionnaire?.answers?.other_medications),
  );

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
      await saveMutation.mutateAsync({ appointmentId, data: { answers: answersForSchema(schema, answers) } });
      toast({ title: 'Sačuvano', description: 'Možete zatvoriti stranicu i nastaviti kasnije preko istog linka.' });
    } catch {
      toast({ title: 'Odgovori nisu sačuvani', description: 'Proverite internet vezu i pokušajte ponovo.', variant: 'destructive' });
    }
  };

  const handleNext = async () => {
    if (!appointmentId) return;
    try {
      await saveMutation.mutateAsync({ appointmentId, data: { answers: answersForSchema(schema, answers) } });
    } catch {
      toast({ title: 'Odgovori nisu sačuvani', description: 'Proverite internet vezu i pokušajte ponovo.', variant: 'destructive' });
      return;
    }

    if (currentSectionIdx < sections.length - 1) {
      setCurrentSectionIdx((idx) => idx + 1);
      window.scrollTo(0, 0);
      return;
    }

    submitMutation.mutate(
      { appointmentId, data: { answers: answersForSchema(schema, answers) } },
      {
        onSuccess: () => setLocation(`/prepare/${token}/documents`),
        onError: () =>
          toast({ title: 'Upitnik nije poslat', description: 'Odgovori su sačuvani. Pokušajte ponovo za minut.', variant: 'destructive' }),
      }
    );
  };

  const handlePrev = async () => {
    if (appointmentId) {
      try {
        await saveMutation.mutateAsync({ appointmentId, data: { answers: answersForSchema(schema, answers) } });
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
      <PatientShell>
        <PatientCard>
          <div className="space-y-4" aria-busy="true" aria-label="Učitavanje upitnika">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        </PatientCard>
      </PatientShell>
    );
  }

  if (data?.isLocked) {
    return (
      <PatientShell>
        <PatientCard>
          <Lock className="mb-4 size-8 text-muted-foreground" aria-hidden="true" />
          <PatientTitle>Upitnik je zaključan</PatientTitle>
          <p className="mt-3">
            Upitnik je zaključan jer je vreme pregleda počelo. Ako nešto važno treba da se ispravi, pozovite kliniku —
            mogu ponovo da ga otvore.
          </p>
          <p className="mt-3 text-muted-foreground">Odgovori koje ste poslali su sačuvani i doktor ih vidi.</p>
          <Button variant="outline" size="lg" className="mt-8 w-full" onClick={() => setLocation(`/prepare/${token}/done`)}>
            Pogledaj pregled pripreme
          </Button>
        </PatientCard>
      </PatientShell>
    );
  }

  if (!currentSection) {
    return (
      <PatientShell>
        <PatientCard>
          <PatientTitle>Upitnik trenutno nije dostupan</PatientTitle>
          <p className="mt-3 text-muted-foreground">
            Pokušajte ponovo za nekoliko minuta. Ako se ovo ponovi, pozovite kliniku.
          </p>
        </PatientCard>
      </PatientShell>
    );
  }

  const isLastStep = currentSectionIdx === sections.length - 1;

  const renderQuestion = (q: Question) => {
    const val = answers[q.id];
    const labelId = `${q.id}-label`;
    const showHint = q.hint && (!q.mustConfirm || hasPreviousMedication);

    return (
      <div key={q.id} role="group" aria-labelledby={labelId} className="py-6 first:pt-2 last:pb-0">
        {q.type === 'free_text' || q.type === 'date' ? (
          <Label id={labelId} htmlFor={q.id} className="block text-lg font-semibold leading-snug">
            {q.label}
          </Label>
        ) : (
          <p id={labelId} className="text-lg font-semibold leading-snug">
            {q.label}
          </p>
        )}
        {showHint && <p className="mt-1 text-base text-muted-foreground">{q.hint}</p>}

        {q.mustConfirm && hasPreviousMedication && (
          <Alert variant="info" className="mt-3">
            <Info aria-hidden="true" />
            <AlertDescription>
              Prošli put ste naveli ovaj lek. Da li ga i dalje uzimate u istoj dozi? Potvrdite, izmenite ili uklonite.
            </AlertDescription>
          </Alert>
        )}

        <div className="mt-3">
          {q.type === 'date' && (
            <DateOfBirthField variant="patient" value={(val as string) || ''} onChange={(value) => setAnswer(q.id, value)} />
          )}

          {q.type === 'free_text' &&
            (q.id === 'full_name' ? (
              <Input
                id={q.id}
                type="text"
                autoComplete="name"
                value={(val as string) || ''}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                onBlur={() => typeof val === 'string' && setAnswer(q.id, normalizePersonName(val))}
                className="h-14 text-lg"
              />
            ) : (
              <Textarea
                id={q.id}
                value={(val as string) || ''}
                onChange={(e) => setAnswer(q.id, e.target.value)}
                rows={4}
                className="text-lg"
              />
            ))}

          {q.type === 'boolean' && (
            <RadioGroup
              value={val === true ? 'true' : val === false ? 'false' : ''}
              onValueChange={(v) => setAnswer(q.id, v === 'true')}
              className="grid grid-cols-2 gap-3"
              aria-labelledby={labelId}
            >
              {[
                { value: 'true', label: 'Da' },
                { value: 'false', label: 'Ne' },
              ].map((opt) => (
                <ChoiceRow key={opt.value} id={`${q.id}-${opt.value}`} label={opt.label}>
                  <RadioGroupItem value={opt.value} id={`${q.id}-${opt.value}`} />
                </ChoiceRow>
              ))}
            </RadioGroup>
          )}

          {q.type === 'single_choice' && q.options && (
            <RadioGroup
              value={(val as string) || ''}
              onValueChange={(v) => setAnswer(q.id, v)}
              className="grid gap-3"
              aria-labelledby={labelId}
            >
              {q.options.map((opt) => (
                <ChoiceRow key={opt.value} id={`${q.id}-${opt.value}`} label={opt.label}>
                  <RadioGroupItem value={opt.value} id={`${q.id}-${opt.value}`} />
                </ChoiceRow>
              ))}
            </RadioGroup>
          )}

          {q.type === 'multi_choice' && q.options && (
            <div className="grid gap-3">
              {q.options.map((opt) => {
                const selected = Array.isArray(val) && val.includes(opt.value);
                return (
                  <ChoiceRow key={opt.value} id={`${q.id}-${opt.value}`} label={opt.label}>
                    <input
                      id={`${q.id}-${opt.value}`}
                      type="checkbox"
                      className="size-5 shrink-0 accent-primary"
                      checked={!!selected}
                      onChange={(e) => {
                        const current = Array.isArray(val) ? [...val] : [];
                        if (e.target.checked) setAnswer(q.id, [...current, opt.value]);
                        else setAnswer(q.id, current.filter((x) => x !== opt.value));
                      }}
                    />
                  </ChoiceRow>
                );
              })}
            </div>
          )}

          {q.type === 'medication_list' && (
            <MedicationListEditor
              questionId={q.id}
              value={Array.isArray(val) ? (val as MedRow[]) : []}
              onChange={(rows) => setAnswer(q.id, rows)}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <PatientStepShell
      step={currentSectionIdx + 1}
      totalSteps={sections.length + 1 /* + the lab results step */}
      headerAction={
        <Button variant="ghost" onClick={handleSave} disabled={saveMutation.isPending} className="-mr-2 text-primary">
          <Save aria-hidden="true" />
          {saveMutation.isPending ? 'Čuvam…' : 'Sačuvaj'}
        </Button>
      }
      actions={
        <>
          <Button
            variant="outline"
            size="xl"
            onClick={handlePrev}
            disabled={currentSectionIdx === 0}
            className="px-4"
            aria-label="Prethodni korak"
          >
            <ChevronLeft aria-hidden="true" />
            <span className="hidden sm:inline">Nazad</span>
          </Button>
          <Button
            size="xl"
            className="flex-1"
            onClick={handleNext}
            disabled={submitMutation.isPending || saveMutation.isPending}
          >
            {isLastStep ? (submitMutation.isPending ? 'Šaljem…' : 'Pošalji i nastavi na nalaze') : 'Dalje'}
            {!isLastStep && <ChevronRight aria-hidden="true" />}
          </Button>
        </>
      }
    >
      <section className="rounded-xl border bg-card px-5 py-6 sm:px-8 sm:py-8">
        <PatientTitle>{currentSectionTitle}</PatientTitle>
        {currentSection.id === 'stable_profile' && (
          <p className="mt-2 text-muted-foreground">
            {profilePrefilled
              ? 'Popunili smo ono što već znamo o vama — proverite da li je tačno i ispravite ako nije.'
              : 'Odgovore čuvamo na svakom koraku, pa možete prekinuti i nastaviti kasnije.'}
          </p>
        )}
        <div className="mt-4 divide-y">{visibleQuestions.map(renderQuestion)}</div>
      </section>
    </PatientStepShell>
  );
}

function MedicationListEditor({
  questionId,
  value,
  onChange,
}: {
  questionId: string;
  value: MedRow[];
  onChange: (v: MedRow[]) => void;
}) {
  const rows = value.length ? value : [{ name: '', dose: '', frequency: '' }];

  const update = (idx: number, patch: Partial<MedRow>) => {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {rows.map((row, idx) => {
        const base = `${questionId}-${idx}`;
        return (
          <div key={idx} className="rounded-lg border bg-muted/40 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor={`${base}-name`}>Lek</Label>
                <Input id={`${base}-name`} value={row.name} onChange={(e) => update(idx, { name: e.target.value })} placeholder="npr. Euthyrox" className="h-12 text-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${base}-dose`}>Doza</Label>
                <Input id={`${base}-dose`} value={row.dose} onChange={(e) => update(idx, { dose: e.target.value })} placeholder="npr. 75 mcg" className="h-12 text-lg" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${base}-frequency`}>Koliko često</Label>
                <Input id={`${base}-frequency`} value={row.frequency} onChange={(e) => update(idx, { frequency: e.target.value })} placeholder="npr. jednom dnevno" className="h-12 text-lg" />
              </div>
            </div>
            {(rows.length > 1 || row.name) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 -ml-2 text-destructive hover:bg-destructive-soft"
                onClick={() => onChange(rows.filter((_, i) => i !== idx))}
              >
                Ukloni ovaj lek
              </Button>
            )}
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="w-full"
        onClick={() => onChange([...rows, { name: '', dose: '', frequency: '' }])}
      >
        <Plus aria-hidden="true" />
        Dodaj još jedan lek
      </Button>
    </div>
  );
}
