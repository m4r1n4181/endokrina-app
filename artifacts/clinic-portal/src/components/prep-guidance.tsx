/** "What to prepare for your visit" — shown before the questionnaire and again at the end. */
import { Check } from 'lucide-react';
import { prepGuidanceFor } from '@/lib/prep-guidance';
import { cn } from '@/lib/utils';

export function PrepGuidanceList({
  appointmentType,
  title = 'Šta da pripremite za pregled',
  showFootnote = true,
  className,
}: {
  appointmentType?: string | null;
  title?: string;
  showFootnote?: boolean;
  className?: string;
}) {
  const guidance = prepGuidanceFor(appointmentType);

  return (
    <section className={cn('rounded-lg border bg-muted/50 p-5', className)} aria-labelledby="prep-guidance-title">
      <h2 id="prep-guidance-title" className="text-xl font-semibold text-foreground">
        {title}
      </h2>
      <p className="mt-1 text-base text-muted-foreground">{guidance.labsNote}</p>
      <ul className="mt-4 space-y-3">
        {guidance.items.map((item) => (
          <li key={item} className="flex items-start gap-3">
            <Check className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
      {showFootnote && (
        <p className="mt-4 text-base text-muted-foreground">
          Nalaze možete dodati u ovoj pripremi (slika telefonom je dovoljna) ili ih doneti na pregled.
        </p>
      )}
    </section>
  );
}
