/**
 * Shells for the patient flow (mobile-first, 18px body text, 48px+ controls).
 *
 *  PatientShell      — one centred card: link check, date of birth, code, consent, done.
 *  PatientStepShell  — a multi-step form: sticky header with progress, fixed action bar.
 *
 * Both end with the same help line and the "not EMR" notice, so a patient who is stuck
 * always knows they can call the clinic (replaces the old "do you need help?" question).
 */
import type { ReactNode } from 'react';
import { Phone } from 'lucide-react';
import { BrandMark } from '@/components/brand';
import { NotEmrNotice } from '@/components/not-emr-notice';
import { cn } from '@/lib/utils';

function PatientHelp() {
  return (
    <div className="flex items-start gap-3 text-base text-muted-foreground">
      <Phone className="mt-1 size-5 shrink-0" aria-hidden="true" />
      <p>
        Treba vam pomoć oko popunjavanja? Pozovite kliniku — osoblje može da vam objasni pitanja ili
        pošalje novi link.
      </p>
    </div>
  );
}

function PatientFooter({ className }: { className?: string }) {
  return (
    <footer className={cn('space-y-4 border-t pt-6', className)}>
      <PatientHelp />
      <NotEmrNotice variant="patient" />
    </footer>
  );
}

export function PatientShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-lg leading-relaxed">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-xl items-center px-4">
          <BrandMark compact />
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl px-4 pb-12 pt-6 sm:pt-12">
        {children}
        <PatientFooter className="mt-10" />
      </main>
    </div>
  );
}

/** The white card a PatientShell page sits in. */
export function PatientCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-xl border bg-card p-6 shadow-sm sm:p-8', className)}>{children}</section>;
}

/** Page title for the patient flow: same size and weight on every step. */
export function PatientTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h1 className={cn('text-[1.75rem] font-semibold leading-tight text-foreground sm:text-3xl', className)}>{children}</h1>;
}

export function PatientStepShell({
  step,
  totalSteps,
  stepLabel,
  headerAction,
  actions,
  children,
}: {
  step?: number;
  totalSteps?: number;
  stepLabel?: string;
  headerAction?: ReactNode;
  actions: ReactNode;
  children: ReactNode;
}) {
  const hasProgress = typeof step === 'number' && typeof totalSteps === 'number' && totalSteps > 0;
  const percent = hasProgress ? Math.round((step / totalSteps) * 100) : 0;

  return (
    <div className="min-h-dvh bg-background pb-32 text-lg leading-relaxed">
      <header className="sticky top-0 z-20 border-b bg-card">
        <div className="mx-auto flex h-16 max-w-2xl items-center justify-between gap-3 px-4">
          <BrandMark compact />
          {headerAction}
        </div>
        {hasProgress && (
          <div className="mx-auto max-w-2xl px-4 pb-3">
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-base">
              <span className="font-medium text-foreground">
                Korak {step} od {totalSteps}
              </span>
              {stepLabel && <span className="truncate text-muted-foreground">{stepLabel}</span>}
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label={`Korak ${step} od ${totalSteps}`}
            >
              <div className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-2xl px-4 pt-6 sm:pt-8">
        {children}
        <PatientFooter className="mt-12" />
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-card pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4">{actions}</div>
      </div>
    </div>
  );
}
