/**
 * Renders one backend-generated templated summary as a separate "document" panel:
 * visually distinct from the raw questionnaire answers, copy-paste ready, with the generation
 * timestamp, the template version and an explicit note that the content is patient-reported
 * (not doctor-verified). Lines without patient data are highlighted instead of hidden.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { srLatn } from 'date-fns/locale';
import type { Summary } from '@workspace/api-client-react';

import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { copyTextToClipboard } from '@/lib/clipboard';
import { SUMMARY_VARIANT_HINTS, SUMMARY_VARIANT_LABELS, labelFor } from '@/lib/labels';
import { countMissingLines, getSummaryLines, normalizeSummaryContent } from '@/lib/summary';
import { AlertTriangle, Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

export function SummaryPanel({ summary, className }: { summary: Summary; className?: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  const variantLabel = labelFor(SUMMARY_VARIANT_LABELS, summary.variant);
  const hint = SUMMARY_VARIANT_HINTS[summary.variant];
  const normalized = normalizeSummaryContent(summary.content);
  const lines = getSummaryLines(normalized);
  const missingCount = countMissingLines(lines);

  const handleCopy = async () => {
    try {
      await copyTextToClipboard(normalized);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
      toast({ title: 'Sažetak kopiran', description: 'Formatiranje je sačuvano za prenošenje u nalaz.' });
    } catch {
      toast({ title: 'Kopiranje nije uspelo', description: 'Označite tekst i kopirajte ručno.', variant: 'destructive' });
    }
  };

  return (
    <section className={cn('rounded-lg border bg-card', className)}>
      <header className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between md:px-6">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold">{variantLabel}</h3>
          {hint && <p className="mt-0.5 text-base text-muted-foreground">{hint}</p>}
          <p className="mt-2 text-sm text-muted-foreground">
            Generisano {format(new Date(summary.generatedAt), "d. MMM yyyy. 'u' HH:mm", { locale: srLatn })}
            {summary.templateVersion ? ` · šablon ${summary.templateVersion}` : ''} · iz podataka koje je prijavio
            pacijent, nije proverio doktor
          </p>
        </div>
        <Button
          type="button"
          variant={copied ? 'outline' : 'default'}
          onClick={handleCopy}
          className="shrink-0"
          aria-label={`Kopiraj: ${variantLabel}`}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? 'Kopirano' : 'Kopiraj sažetak'}
        </Button>
      </header>

      {missingCount > 0 && (
        <p className="mx-4 mt-4 flex items-start gap-2 rounded-md border border-warning-border bg-warning-soft px-3 py-2 text-base md:mx-6">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden="true" />
          {missingCount === 1
            ? 'Jedna stavka u sažetku nema podatke pacijenta (označeno je ispod).'
            : `${missingCount} stavki u sažetku nemaju podatke pacijenta (označene su ispod).`}{' '}
          Proverite izvorne odgovore ako je podatak klinički važan.
        </p>
      )}

      <div className="space-y-1 whitespace-pre-wrap px-4 py-5 text-base leading-relaxed md:px-6">
        {lines.map((line, index) => {
          // Blank lines only separate blocks; headings already carry their own space above.
          if (!line.text) return null;
          if (line.type === 'heading') {
            return (
              <p key={index} className="mt-5 text-base font-semibold first:mt-0">
                {line.text}
              </p>
            );
          }
          if (line.type === 'missing') {
            return (
              <p key={index} className="flex items-start gap-1.5 text-warning">
                <AlertTriangle className="mt-1 size-4 shrink-0" aria-hidden="true" />
                <span className="italic">{line.text}</span>
              </p>
            );
          }
          if (line.type === 'doctor-note') {
            return (
              <p key={index} className="italic text-muted-foreground">
                {line.text}
              </p>
            );
          }
          return <p key={index}>{line.text}</p>;
        })}
      </div>
    </section>
  );
}
