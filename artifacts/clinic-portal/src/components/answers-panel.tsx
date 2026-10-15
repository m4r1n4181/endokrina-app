/**
 * Read-only presentation of patient questionnaire answers, grouped into readable sections
 * with Serbian question labels (from the schema, with a static fallback).
 *
 * Used by the doctor's appointment view and by the patient history snapshots. The doctor
 * cannot edit answers — this component intentionally contains no inputs.
 */
import { useMemo } from 'react';
import {
  countAnsweredQuestions,
  countMissingAnswers,
  groupAnswers,
  useQuestionnaireSchema,
} from '@/lib/questionnaire';
import { cn } from '@/lib/utils';
import { AlertTriangle, Lock } from 'lucide-react';

export function AnswersPanel({
  answers,
  className,
  showReadOnlyHint = true,
}: {
  answers: Record<string, unknown> | undefined | null;
  className?: string;
  showReadOnlyHint?: boolean;
}) {
  const { data: schema } = useQuestionnaireSchema();
  const groups = useMemo(() => groupAnswers(schema, answers), [schema, answers]);

  const answeredCount = countAnsweredQuestions(groups);
  const missingCount = countMissingAnswers(groups);

  if (!answers || Object.keys(answers).length === 0) {
    return (
      <div className={cn('rounded-lg border bg-card px-6 py-10 text-center', className)}>
        <p className="text-lg font-semibold">Pacijent još nije uneo odgovore</p>
        <p className="mt-1 text-base text-muted-foreground">Odgovori će se pojaviti ovde čim pacijent sačuva prvi korak upitnika.</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-5', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-base">
        <span className="font-medium">{answeredCount} odgovoreno</span>
        {missingCount > 0 && (
          <span className="inline-flex items-center gap-1.5 font-medium text-warning">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {missingCount} bez odgovora
          </span>
        )}
        {showReadOnlyHint && (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Lock className="size-4" aria-hidden="true" />
            Samo za čitanje
          </span>
        )}
      </div>

      {groups.map((group) => (
        <section key={group.sectionId} className="rounded-lg border bg-card">
          <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3 md:px-6">
            <h3 className="text-lg font-semibold">{group.title}</h3>
            <span className="text-sm text-muted-foreground">
              {group.entries.length - group.missingCount} od {group.entries.length}
            </span>
          </header>

          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 px-4 py-4 md:grid-cols-2 md:px-6">
            {group.entries.map((entry) => (
              <div key={entry.questionId} className="min-w-0">
                <dt className="text-sm text-muted-foreground">{entry.label}</dt>
                <dd
                  className={cn(
                    'mt-0.5 whitespace-pre-wrap break-words text-base',
                    entry.missing ? 'italic text-warning' : 'font-medium text-foreground'
                  )}
                >
                  {entry.text}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
