import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useVerifyDob } from '@workspace/api-client-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { DateOfBirthField } from '@/components/date-of-birth-field';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { PatientCard, PatientShell, PatientTitle } from '@/components/layout/patient-shell';
import { Clock3, Link2Off, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const dobSchema = z.object({
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Izaberite dan, mesec i godinu rođenja.'),
});

export default function PrepareLanding() {
  const { token } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const verifyMutation = useVerifyDob();
  const [linkStatus, setLinkStatus] = useState<'checking' | 'active' | 'expired' | 'inactive'>('checking');

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setLinkStatus('inactive');
      return () => {
        cancelled = true;
      };
    }

    fetch(`/api/patient-auth/link-status?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Link status unavailable');
        return response.json() as Promise<{ status?: string }>;
      })
      .then((result) => {
        if (cancelled) return;
        setLinkStatus(result.status === 'active' ? 'active' : result.status === 'expired' ? 'expired' : 'inactive');
      })
      .catch(() => {
        if (!cancelled) setLinkStatus('inactive');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const form = useForm<z.infer<typeof dobSchema>>({
    resolver: zodResolver(dobSchema),
    defaultValues: { dateOfBirth: '' },
  });

  const onSubmit = (values: z.infer<typeof dobSchema>) => {
    verifyMutation.mutate({ data: { token: token || '', dateOfBirth: values.dateOfBirth } }, {
      onSuccess: (res) => {
        if (res.otpSent) {
          if (res.email) sessionStorage.setItem('patient_masked_email', res.email);
          setLocation(`/prepare/${token}/otp`);
        } else {
          toast({ title: 'Kod nije poslat', description: 'Nismo uspeli da pošaljemo kod. Pokušajte ponovo za minut.', variant: 'destructive' });
        }
      },
      onError: (err: any) => {
        const code = err?.data?.code;
        const remaining = err?.data?.attemptsRemaining;
        const msg =
          code === 'DOB_MISMATCH'
            ? `Datum rođenja se ne poklapa sa podacima klinike. Proverite unos i pokušajte ponovo.${
                typeof remaining === 'number' ? ` Preostalo pokušaja: ${remaining}.` : ''
              }`
            : code === 'DOB_BLOCKED' || code === 'DOB_RATE_LIMITED'
              ? 'Previše pokušaja u kratkom vremenu. Sačekajte nekoliko minuta i pokušajte ponovo, ili pozovite kliniku.'
              : code === 'EMAIL_UNAVAILABLE'
                ? 'Ne možemo da pošaljemo kod jer email adresa nije uneta. Pozovite kliniku da je dopuni.'
                : code === 'LINK_INACTIVE' || code === 'LINK_EXPIRED'
                  ? 'Link više nije aktivan. Pozovite kliniku da vam pošalje novi link.'
                  : 'Podaci nisu tačni ili je link istekao. Proverite datum rođenja ili pozovite kliniku.';
        toast({ title: 'Provera nije uspela', description: msg, variant: 'destructive' });
      }
    });
  };

  const isUnavailable = linkStatus === 'expired' || linkStatus === 'inactive';

  return (
    <PatientShell>
      {linkStatus === 'checking' && (
        <PatientCard>
          <div className="flex flex-col items-center py-8 text-center" role="status">
            <LoaderCircle className="size-8 animate-spin text-primary" aria-hidden="true" />
            <p className="mt-4">Proveravamo vašu pozivnicu…</p>
          </div>
        </PatientCard>
      )}

      {isUnavailable && (
        <PatientCard>
          {linkStatus === 'expired' ? (
            <Clock3 className="mb-4 size-8 text-warning" aria-hidden="true" />
          ) : (
            <Link2Off className="mb-4 size-8 text-warning" aria-hidden="true" />
          )}
          <PatientTitle>{linkStatus === 'expired' ? 'Ovaj link je istekao' : 'Ovaj link nije aktivan'}</PatientTitle>
          <p className="mt-3 text-muted-foreground">
            {linkStatus === 'expired'
              ? 'Pozivnica više ne važi. Pozovite kliniku i zatražite novi link — vaši sačuvani odgovori ostaju.'
              : 'Proverite da li ste otvorili najnoviji link iz emaila. Ako jeste, pozovite kliniku da vam pošalje novi.'}
          </p>
        </PatientCard>
      )}

      {linkStatus === 'active' && (
        <PatientCard>
          <PatientTitle>Priprema za pregled</PatientTitle>
          <p className="mt-3 text-muted-foreground">
            Radi vaše privatnosti, unesite datum rođenja da biste otvorili upitnik.
          </p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-8">
              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-lg">Datum rođenja</FormLabel>
                    <FormControl>
                      <DateOfBirthField
                        variant="patient"
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        disabled={field.disabled}
                      />
                    </FormControl>
                    <FormMessage className="text-base" />
                  </FormItem>
                )}
              />
              <Button type="submit" size="xl" className="w-full" disabled={verifyMutation.isPending}>
                {verifyMutation.isPending ? 'Proveravam…' : 'Nastavi'}
              </Button>
            </form>
          </Form>

          <p className="mt-6 flex items-start gap-3 text-base text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            Vaše podatke vidi samo vaš doktor, i to radi pripreme za pregled.
          </p>
        </PatientCard>
      )}
    </PatientShell>
  );
}
