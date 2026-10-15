/**
 * Empty / filtered-empty state. Sits inside the list's own frame so the page keeps its shape:
 * what belongs here, one sentence on what to do, and the action that does it.
 */
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      {Icon && <Icon className="mb-4 size-8 text-muted-foreground" aria-hidden="true" />}
      <p className="text-lg font-semibold text-foreground">{title}</p>
      {description && <p className="mt-1 max-w-md text-base text-muted-foreground">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
