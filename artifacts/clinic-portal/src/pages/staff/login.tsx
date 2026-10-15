import { useLocation } from 'wouter';
import { useState } from 'react';
import { useLoginStaff } from '@workspace/api-client-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BrandMark } from '@/components/brand';
import { NotEmrNotice } from '@/components/not-emr-notice';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';

const loginSchema = z.object({
  email: z.string().email('Unesite ispravan email'),
  password: z.string().min(1, 'Lozinka je obavezna'),
  mfaToken: z.string().optional(),
});

export default function LoginStaff() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const loginMutation = useLoginStaff();
  const [requiresMfa, setRequiresMfa] = useState(false);

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    loginMutation.mutate(
      { data: values },
      {
        onSuccess: (res) => {
          localStorage.setItem('staff_token', res.accessToken);
          if (res.refreshToken) localStorage.setItem('staff_refresh_token', res.refreshToken);
          else localStorage.removeItem('staff_refresh_token');
          setLocation('/dashboard');
        },
        onError: (err: any) => {
          if (err?.data?.code === 'MFA_REQUIRED') {
            setRequiresMfa(true);
            return;
          }
          toast({
            title: 'Prijava nije uspela',
            description: err?.data?.error || 'Email ili lozinka nisu tačni. Proverite ih i pokušajte ponovo.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <BrandMark className="mb-8" />
        <div className="rounded-lg border bg-card p-6 shadow-sm sm:p-8">
          <h1 className="text-2xl font-semibold">Prijava za osoblje</h1>
          <p className="mb-6 mt-1 text-base text-muted-foreground">Za doktore, sestre i administraciju klinike.</p>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="username" placeholder="ime@klinika.rs" {...field} data-testid="input-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lozinka</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} data-testid="input-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {requiresMfa && (
                <FormField
                  control={form.control}
                  name="mfaToken"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kod iz emaila</FormLabel>
                      <FormControl>
                        <InputOTP maxLength={6} {...field}>
                          <InputOTPGroup className="gap-2">
                            {Array.from({ length: 6 }, (_, index) => (
                              <InputOTPSlot
                                key={index}
                                index={index}
                                className="h-14 w-11 text-2xl sm:w-12"
                              />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </FormControl>
                      <p className="text-sm text-muted-foreground">Poslali smo šestocifreni kod na email adresu vašeg naloga.</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={loginMutation.isPending}
                data-testid="button-submit-login"
              >
                {loginMutation.isPending ? 'Prijavljujem…' : 'Prijavi se'}
              </Button>
            </form>
          </Form>
        </div>
        <NotEmrNotice variant="staff" className="mt-6" />
      </div>
    </div>
  );
}
