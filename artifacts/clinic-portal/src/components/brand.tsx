/** Endokrina wordmark: a small square mark and the name. One brand, everywhere. */
import { cn } from '@/lib/utils';

export function BrandMark({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 180 180" className={compact ? 'size-7' : 'size-8'} aria-hidden="true">
        <rect width="180" height="180" rx="40" className="fill-primary" />
        <path d="M58 46H124V66H80V80H118V100H80V114H124V134H58V46Z" fill="#fff" />
      </svg>
      <span className="flex flex-col leading-tight">
        <span className="text-lg font-semibold text-foreground">Endokrina</span>
        {!compact && <span className="text-sm text-muted-foreground">Priprema za pregled</span>}
      </span>
    </span>
  );
}
