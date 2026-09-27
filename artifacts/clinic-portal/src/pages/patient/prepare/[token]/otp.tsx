import { useLocation, useParams } from 'wouter';
import { useVerifyOtp, useResendOtp } from '@workspace/api-client-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { usePatientAuth } from '@/hooks/use-patient-auth';

import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Mail } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';

const otpSchema = z.object({
  otp: z.string().length(6, "Potreban je kod od 6 cifara"),
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
        toast({ title: 'Kod poslat', description: 'Proverite email (i spam folder).' });
        setCooldown(60);
      },
      onError: (err: any) => {
        const retryAfter = err?.response?.data?.retryAfterSeconds;
        if (retryAfter) {
          setCooldown(retryAfter);
          toast({ title: 'Sačekajte malo', description: `Možete zatražiti novi kod za ${retryAfter}s.` });
        } else {
          toast({ title: 'Greška', description: 'Pokušajte ponovo kasnije.', variant: 'destructive' });
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
        toast({ title: 'Neispravan kod', description: 'Pokušajte ponovo.', variant: 'destructive' });
      }
    });
  };

  return (
    <div className="min-h-screen bg-patient-portal-gradient flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 p-8 text-center">
        <div className="mx-auto w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-6">
          <Mail size={32} />
        </div>
        
        <h1 className="text-2xl font-serif text-[#185e46] mb-4">Potvrdite email adresu</h1>
        <p className="text-gray-600 mb-8">
          Poslali smo email sa 6-cifrenim kodom{maskedEmail ? ` na ${maskedEmail}` : ' na vašu email adresu'}.
          Ako ga ne vidite, proverite i spam/junk folder.
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 flex flex-col items-center">
            <FormField
              control={form.control}
              name="otp"
              render={({ field }) => (
                <FormItem className="flex flex-col items-center">
                  <FormControl>
                    <InputOTP maxLength={6} {...field}>
                      <InputOTPGroup className="gap-2">
                        <InputOTPSlot index={0} className="w-12 h-14 text-2xl border-gray-300 rounded-md" />
                        <InputOTPSlot index={1} className="w-12 h-14 text-2xl border-gray-300 rounded-md" />
                        <InputOTPSlot index={2} className="w-12 h-14 text-2xl border-gray-300 rounded-md" />
                        <InputOTPSlot index={3} className="w-12 h-14 text-2xl border-gray-300 rounded-md" />
                        <InputOTPSlot index={4} className="w-12 h-14 text-2xl border-gray-300 rounded-md" />
                        <InputOTPSlot index={5} className="w-12 h-14 text-2xl border-gray-300 rounded-md" />
                      </InputOTPGroup>
                    </InputOTP>
                  </FormControl>
                  <FormMessage className="text-red-500 mt-2" />
                </FormItem>
              )}
            />
            
            <Button 
              type="submit" 
              className="w-full text-lg py-6 bg-[#185e46] hover:bg-[#124a37] text-white rounded-xl"
              disabled={verifyMutation.isPending || form.watch('otp').length < 6}
            >
              {verifyMutation.isPending ? 'Proveravam...' : 'Potvrdi'}
            </Button>
            <Button
              type="button"
              onClick={handleResend}
              disabled={cooldown > 0 || resendMutation.isPending}
              className="mt-4 text-sm text-[#185e46] underline disabled:text-gray-400 disabled:no-underline bg-transparent"
            >
              {cooldown > 0 ? `Pošalji ponovo (${cooldown}s)` : 'Niste dobili kod? Pošaljite ponovo'}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
