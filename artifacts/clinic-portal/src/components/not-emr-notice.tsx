/**
 * "Not EMR" notice (UX requirements §9). One wording per audience, written once.
 */
import { cn } from '@/lib/utils';

const COPY = {
  patient:
    'Ovaj formular pomaže vašem doktoru da se pripremi za pregled. Ne zamenjuje medicinski pregled ni zvaničnu evidenciju klinike.',
  staff:
    'Endokrina nije zvanična medicinska evidencija (EMR). Odgovore i dokumente pacijenta vidi samo doktor.',
} as const;

export function NotEmrNotice({
  variant,
  className,
}: {
  variant: keyof typeof COPY;
  className?: string;
}) {
  return <p className={cn('max-w-prose text-sm text-muted-foreground', className)}>{COPY[variant]}</p>;
}
