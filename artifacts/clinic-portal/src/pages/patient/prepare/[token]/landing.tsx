import { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useVerifyDob } from '@workspace/api-client-react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Stethoscope, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const dobSchema = z.object({
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format mora biti GGGG-MM-DD"),
});

export default function PrepareLanding() {
  const { token } = useParams();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const verifyMutation = useVerifyDob();

  const form = useForm<z.infer<typeof dobSchema>>({
    resolver: zodResolver(dobSchema),
    defaultValues: { dateOfBirth: '' },
  });

  const onSubmit = (values: z.infer<typeof dobSchema>) => {
    verifyMutation.mutate({ data: { token: token || '', dateOfBirth: values.dateOfBirth } }, {
      onSuccess: (res) => {
        if (res.otpSent) {
          if (res.phone) sessionStorage.setItem('patient_masked_phone', res.phone);
          setLocation(`/prepare/${token}/otp`);
        } else {
          toast({ title: 'Greška', description: 'Nije moguće poslati kod. Pokušajte ponovo.', variant: 'destructive' });
        }
      },
      onError: (err: any) => {
        const code = err?.data?.code;
        const msg =
          code === 'DOB_MISMATCH' ? 'Datum rođenja nije tačan. Proverite i pokušajte ponovo.' :
          code === 'DOB_BLOCKED' || code === 'DOB_RATE_LIMITED' ? 'Previše pokušaja. Sačekajte i pokušajte kasnije.' :
          code === 'LINK_INACTIVE' ? 'Link više nije aktivan. Kontaktirajte kliniku.' :
          'Podaci nisu tačni ili je link istekao.';
        toast({ title: 'Greška', description: msg, variant: 'destructive' });
      }
    });
  };

  return (
    <div className="min-h-screen bg-patient-portal-gradient flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl overflow-hidden border border-gray-100 p-8">
        <div className="text-center space-y-6 mb-8">
          <div className="mx-auto w-16 h-16 bg-[#185e46] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[#185e46]/20">
            <Stethoscope size={32} />
          </div>
          <h1 className="text-3xl font-serif text-[#185e46] leading-tight">Priprema za pregled</h1>
          <p className="text-gray-600 text-lg">
            Radi vaše privatnosti, unesite datum rođenja da biste otvorili upitnik.
          </p>
        </div>

        <div className="bg-green-50 text-green-800 p-4 rounded-xl mb-6 flex items-start gap-3 text-sm">
          <ShieldCheck className="shrink-0 mt-0.5" />
          <p>Vaši podaci su zaštićeni i namenjeni pripremi doktora za pregled.</p>
        </div>

        <p className="text-xs text-gray-500 mb-6 leading-relaxed">
          Ovaj formular pomaže vašem doktoru da se pripremi za pregled. On ne zamenjuje medicinski pregled ili zvaničnu evidenciju klinike.
        </p>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="dateOfBirth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-gray-700 text-base">Datum rođenja</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="npr. 1980-05-15" 
                      className="text-lg py-6 bg-gray-50 border-gray-200 focus:border-[#185e46] focus:ring-[#185e46]" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button 
              type="submit" 
              className="w-full text-lg py-6 bg-[#185e46] hover:bg-[#124a37] text-white rounded-xl"
              disabled={verifyMutation.isPending}
            >
              {verifyMutation.isPending ? 'Proveravam...' : 'Nastavi'}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}
