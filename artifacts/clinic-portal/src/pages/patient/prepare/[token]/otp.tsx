import { useLocation, useParams } from 'wouter';
import { useVerifyOtp, useResendOtp } from '@workspace/api-client-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { usePatientAuth } from '@/hooks/use-patient-auth';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { PatientCard, PatientShell, PatientTitle } from '@/components/layout/patient-shell';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';

const otpSchema = z.object({
  otp: z.string().length(6, 'Unesite svih 6 cifara iz emaila.'),
});

export default function PrepareOtp() {
  const { token } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { login } = usePatientAuth();
  const verifyMutation = useVerifyOtp();
  const maskedEmail = sessionStorage.getItem('patient_masked_email');
  const resendMutation = useResendOtp();
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleResend = () => {
    resendMutation.mutate({ data: { token: token || '' } }, {
      onSuccess: () => {
        toast({ title: 'Novi kod je poslat', description: 'Proverite email, i folder za neželjenu poštu (spam).' });
        setCooldown(60);
      },
      onError: (err: any) => {
        const retryAfter = err?.response?.data?.retryAfterSeconds;
        if (retryAfter) {
          setCooldown(retryAfter);
          toast({ title: 'Sačekajte malo', description: `Novi kod možete zatražiti za ${retryAfter} sekundi.` });
        } else {
          toast({ title: 'Kod nije poslat', description: 'Pokušajte ponovo za minut, ili pozovite kliniku.', variant: 'destructive' });
        }
      }
    });
  };

  const form = useForm<z.infer<typeof otpSchema>>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: '' },
  });

  const onSubmit = (values: z.infer<typeof otpSchema>) => {
    verifyMutation.mutate({ data: { token: token || '', otp: values.otp } }, {
      onSuccess: (res) => {
        login({ patientToken: res.patientToken, appointmentId: res.appointmentId });
        setLocation(`/prepare/${token}/consent`);
      },
      onError: () => {
        toast({ title: 'Kod nije tačan', description: 'Proverite cifre iz najnovijeg emaila i pokušajte ponovo.', variant: 'destructive' });
      }
    });
  };

  return (
    <PatientShell>
      <PatientCard>
        <PatientTitle>Unesite kod iz emaila</PatientTitle>
        <p className="mt-3 text-muted-foreground">
          Poslali smo šestocifreni kod{maskedEmail ? ` na ${maskedEmail}` : ' na vašu email adresu'}. Ako ga ne vidite,
          pogledajte i folder za neželjenu poštu (spam).
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-8">
            <FormField
              control={form.control}
              name="otp"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-lg">Kod</FormLabel>
                  <FormControl>
                    <InputOTP maxLength={6} inputMode="numeric" autoComplete="one-time-code" {...field}>
                      <InputOTPGroup className="w-full justify-between gap-2">
                        {Array.from({ length: 6 }, (_, index) => (
                          <InputOTPSlot key={index} index={index} className="h-14 w-auto min-w-0 flex-1 text-2xl" />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </FormControl>
                  <FormMessage className="text-base" />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              size="xl"
              className="w-full"
              disabled={verifyMutation.isPending || form.watch('otp').length < 6}
            >
              {verifyMutation.isPending ? 'Proveravam…' : 'Potvrdi kod'}
            </Button>
          </form>
        </Form>

        <div className="mt-6 border-t pt-6">
          <p className="text-muted-foreground">Kod nije stigao?</p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="mt-3 w-full"
            onClick={handleResend}
            disabled={cooldown > 0 || resendMutation.isPending}
          >
            {cooldown > 0 ? `Pošalji ponovo za ${cooldown} s` : 'Pošalji novi kod'}
          </Button>
        </div>
      </PatientCard>
    </PatientShell>
  );
}
