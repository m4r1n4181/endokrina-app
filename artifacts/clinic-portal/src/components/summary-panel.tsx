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

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { copyTextToClipboard } from '@/lib/clipboard';
import { SUMMARY_VARIANT_HINTS, SUMMARY_VARIANT_LABELS, labelFor } from '@/lib/labels';
import { countMissingLines, getSummaryLines, normalizeSummaryContent } from '@/lib/summary';
import { AlertTriangle, Check, Copy, FileText, Info } from 'lucide-react';
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
    <section className={cn('rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-6', className)}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 font-serif text-lg font-semibold text-primary">
            <FileText size={18} aria-hidden="true" />
            {variantLabel}
          </h4>
          {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
        </div>
        <Button
          type="button"
          variant={copied ? 'outline' : 'default'}
          onClick={handleCopy}
          className="gap-2"
          aria-label={`Kopiraj: ${variantLabel}`}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Kopirano' : 'Kopiraj sažetak'}
        </Button>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <Badge variant="outline" className="border-gray-200 bg-white text-gray-600">
          Generisano: {format(new Date(summary.generatedAt), 'd. MMM yyyy. HH:mm', { locale: srLatn })}
        </Badge>
        {summary.templateVersion && (
          <Badge variant="outline" className="border-gray-200 bg-white text-gray-600">
            Šablon: {summary.templateVersion}
          </Badge>
        )}
        <span className="flex items-center gap-1">
          <Info size={12} aria-hidden="true" />
          Automatski sažetak iz podataka koje je pacijent prijavio — nije verifikovan od strane doktora.
        </span>
      </div>

      {missingCount > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          {missingCount === 1
            ? 'Jedna stavka u sažetku nema podatke pacijenta (označeno je ispod).'
            : `${missingCount} stavki u sažetku nemaju podatke pacijenta (označene su ispod).`}{' '}
          Proverite izvorne odgovore ako je podatak klinički važan.
        </p>
      )}

      <div className="mt-4 whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-4 font-serif text-sm leading-relaxed text-gray-800">
        {lines.map((line, index) => {
          if (!line.text) return <span key={index}>{'\n'}</span>;
          if (line.type === 'heading') {
            return (
              <p key={index} className="mt-4 first:mt-0 text-sm font-semibold uppercase tracking-wide text-primary">
                {line.text}
              </p>
            );
          }
          if (line.type === 'missing') {
            return (
              <p key={index} className="flex items-start gap-1.5 text-amber-800">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span className="italic">{line.text}</span>
              </p>
            );
          }
          if (line.type === 'doctor-note') {
            return (
              <p key={index} className="italic text-gray-400">
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
