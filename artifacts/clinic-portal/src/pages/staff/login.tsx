import { useLocation } from 'wouter';
import { useState } from 'react';
import { useLoginStaff } from '@workspace/api-client-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useToast } from '@/hooks/use-toast';
import { Stethoscope } from 'lucide-react';

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
            description: err?.data?.error || 'Pogrešni podaci. Pokušajte ponovo.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50/50 p-4">
      <Card className="w-full max-w-md shadow-lg border-primary/10">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-primary-foreground shadow-sm">
            <Stethoscope size={24} />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-serif text-primary">Portal klinike</CardTitle>
            <CardDescription>Prijava za osoblje i doktore</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="doctor@clinic.com" {...field} data-testid="input-email" />
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
                      <Input type="password" {...field} data-testid="input-password" />
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
                      <FormLabel>MFA kod</FormLabel>
                      <FormControl>
                        <InputOTP maxLength={6} {...field}>
                          <InputOTPGroup className="gap-2">
                            {Array.from({ length: 6 }, (_, index) => (
                              <InputOTPSlot
                                key={index}
                                index={index}
                                className="w-12 h-14 text-2xl border-gray-300 rounded-md"
                              />
                            ))}
                          </InputOTPGroup>
                        </InputOTP>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={loginMutation.isPending}
                data-testid="button-submit-login"
              >
                {loginMutation.isPending ? 'Prijava...' : 'Prijavi se'}
              </Button>
            </form>
          </Form>
          <p className="text-xs text-gray-500 mt-6 text-center">
            Platforma nije zvanična medicinska evidencija. Koristi se za pripremu pregleda.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
