/**
 * Read-only presentation of patient questionnaire answers, grouped into readable sections
 * with Serbian question labels (from the schema, with a static fallback).
 *
 * Used by the doctor's appointment view and by the patient history snapshots. The doctor
 * cannot edit answers — this component intentionally contains no inputs.
 */
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
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
      <div className={cn('rounded-xl border border-dashed bg-gray-50 p-6 text-center text-sm text-gray-500', className)}>
        Pacijent još nije uneo odgovore.
      </div>
    );
  }

  return (
    <div className={cn('space-y-5', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-700">
          Odgovoreno: {answeredCount}
        </Badge>
        {missingCount > 0 && (
          <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-900">
            <AlertTriangle size={12} aria-hidden="true" />
            Bez odgovora: {missingCount}
          </Badge>
        )}
        {showReadOnlyHint && (
          <span className="flex items-center gap-1 text-xs text-gray-500">
            <Lock size={12} aria-hidden="true" />
            Prikaz je samo za čitanje — odgovori pacijenta se ne mogu menjati.
          </span>
        )}
      </div>

      {groups.map((group) => (
        <section key={group.sectionId} className="rounded-xl border bg-white p-4">
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b pb-2">
            <h4 className="font-serif text-base font-semibold text-primary">{group.title}</h4>
            <span className="text-xs text-gray-500">
              {group.entries.length - group.missingCount} / {group.entries.length} odgovoreno
            </span>
          </header>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
            {group.entries.map((entry) => (
              <div key={entry.questionId} className="min-w-0">
                <dt className="text-xs text-gray-500">{entry.label}</dt>
                <dd
                  className={cn(
                    'whitespace-pre-wrap text-sm',
                    entry.missing ? 'italic text-amber-800' : 'font-medium text-gray-900'
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
