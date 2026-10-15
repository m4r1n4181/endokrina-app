/**
 * A whole-row tappable option for the patient flow (radio or checkbox inside):
 * 56px tall, 18px label, highlighted in the brand tint when chosen.
 */
import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function ChoiceRow({ id, label, children }: { id: string; label: ReactNode; children: ReactNode }) {
  return (
    <Label
      htmlFor={id}
      className={cn(
        'flex min-h-14 cursor-pointer items-center gap-3 rounded-lg border border-input bg-card px-4 py-3 text-lg font-normal transition-colors duration-150 hover:bg-muted',
        'has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary-soft has-[:checked]:border-primary has-[:checked]:bg-primary-soft'
      )}
    >
      {children}
      <span>{label}</span>
    </Label>
  );
}
