import { useState } from 'react';
import { CheckCircle2, Mail, MinusCircle } from 'lucide-react';
import { StaffLayout, PageHeader } from '@/components/layout/staff-layout';
import { StatusBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { useStaffAuth } from '@/hooks/use-staff-auth';
import { useToast } from '@/hooks/use-toast';

export default function StaffSecurity() {
  const { user } = useStaffAuth();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const enabled = Boolean(user?.mfaEnabled);

  const setMfa = async (next: boolean) => {
    setPending(true);
    try {
      const response = await fetch('/api/auth/me/mfa', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Promena nije uspela');
      toast({ title: next ? 'Kod na email je uključen' : 'Kod na email je isključen' });
      window.location.reload();
    } catch (error) {
      toast({
        title: 'Promena nije sačuvana',
        description: error instanceof Error ? error.message : 'Pokušajte ponovo.',
        variant: 'destructive',
      });
    } finally {
      setPending(false);
    }
  };

  return (
    <StaffLayout>
      <PageHeader title="Bezbednost naloga" description="Podešavanja prijave za vaš nalog." />

      <section className="max-w-2xl divide-y rounded-lg border bg-card">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between md:p-6">
          <div className="flex gap-4">
            <Mail className="mt-0.5 size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">Kod za prijavu na email</h2>
                <StatusBadge
                  tone={enabled ? 'success' : 'neutral'}
                  icon={enabled ? CheckCircle2 : MinusCircle}
                  label={enabled ? 'Uključeno' : 'Isključeno'}
                />
              </div>
              <p className="mt-1 max-w-prose text-base text-muted-foreground">
                Pri svakoj prijavi, posle lozinke, šaljemo jednokratni kod na {user?.email ?? 'vaš email'}. Tako niko
                ne može da uđe u nalog samo sa lozinkom.
              </p>
            </div>
          </div>
          <Button
            variant={enabled ? 'outline' : 'default'}
            disabled={pending}
            onClick={() => setMfa(!enabled)}
            className="shrink-0"
          >
            {pending ? 'Čuvam…' : enabled ? 'Isključi' : 'Uključi'}
          </Button>
        </div>
      </section>
    </StaffLayout>
  );
}
