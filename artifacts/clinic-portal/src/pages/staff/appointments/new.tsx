import { useStaffAuth } from '@/hooks/use-staff-auth';
import { StaffLayout } from '../dashboard';
import { useCreateAppointment, useListStaffUsers } from '@workspace/api-client-react';
import { useLocation } from 'wouter';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { copyTextToClipboard } from '@/lib/clipboard';

const formSchema = z.object({
  invitedFullName: z.string().min(2, 'Ime mora imati najmanje 2 karaktera'),
  invitedPhone: z.string().min(5, 'Unesite validan telefon'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format: GGGG-MM-DD'),
  doctorId: z.string().min(1, 'Izaberite doktora'),
  appointmentType: z.string().min(1, 'Tip je obavezan'),
  scheduledAt: z.string().min(1, 'Datum i vreme su obavezni'),
});

export default function NewAppointment() {
  const { user } = useStaffAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const { data: staffList } = useListStaffUsers({
    query: {
      enabled: user?.role === 'clinic_admin',
      queryKey: ['staffUsers'],
    },
  });
  const createMutation = useCreateAppointment();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      invitedFullName: '',
      invitedPhone: '',
      dateOfBirth: '',
      doctorId: '',
      appointmentType: 'follow_up',
      scheduledAt: new Date().toISOString().slice(0, 16),
    },
  });

  if (user?.role !== 'clinic_admin') {
    return (
      <StaffLayout title="Pristup odbijen">
        <Alert variant="destructive" className="max-w-xl mx-auto mt-12">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Nedovoljna ovlašćenja</AlertTitle>
          <AlertDescription>Samo administracija može da kreira pozivnice za pripremu.</AlertDescription>
        </Alert>
      </StaffLayout>
    );
  }

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const payload = {
      ...values,
      scheduledAt: new Date(values.scheduledAt).toISOString(),
    };

    createMutation.mutate(
      { data: payload },
      {
        onSuccess: (res) => {
          if (res.possibleDuplicate) {
            toast({
              title: 'Mogući duplikat',
              description: 'Pronađen je sličan pacijent (npr. isti telefon). Proverite pre spajanja — automatsko spajanje nije urađeno.',
            });
          } else {
            toast({ title: 'Termin kreiran', description: 'Link za pripremu je generisan.' });
          }
          const url = res.link?.url;
          if (url) setCreatedLink(url);
          else setLocation(`/appointments/${res.appointment.id}`);
        },
        onError: (err: any) => {
          toast({
            title: 'Kreiranje nije uspelo',
            description: err?.data?.error || 'Nepoznata greška',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const staffRows = Array.isArray(staffList) ? staffList : (staffList as any)?.users ?? [];
  const doctors = staffRows.filter((s: { role: string; isActive?: boolean }) => s.role === 'doctor' && s.isActive !== false);

  if (createdLink) {
    return (
      <StaffLayout title="Pozivnica kreirana">
        <Card className="max-w-2xl mx-auto">
          <CardHeader>
            <CardTitle>Link za pacijenta</CardTitle>
            <CardDescription>
              Pošaljite ovaj link pacijentu (SMS/Viber). U lokalnom režimu SMS je stub — OTP se vidi u konzoli API servera.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <code className="block bg-gray-50 p-3 rounded border text-sm break-all">{createdLink}</code>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  copyTextToClipboard(createdLink)
                    .then(() => toast({ title: 'Kopirano' }))
                    .catch(() => toast({ title: 'Kopiranje nije uspelo', variant: 'destructive' }));
                }}
              >
                Kopiraj link
              </Button>
              <Button variant="outline" onClick={() => setLocation('/dashboard')}>
                Nazad na pregled
              </Button>
            </div>
          </CardContent>
        </Card>
      </StaffLayout>
    );
  }

  return (
    <StaffLayout title="Nova pozivnica">
      <div className="max-w-2xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>Pozovi pacijenta</CardTitle>
            <CardDescription>
              Unesite ime, telefon, datum rođenja, tip i vreme pregleda. Sistem generiše siguran link za pripremu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="invitedFullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ime i prezime</FormLabel>
                        <FormControl>
                          <Input placeholder="Petar Petrović" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="dateOfBirth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Datum rođenja (GGGG-MM-DD)</FormLabel>
                        <FormControl>
                          <Input placeholder="1980-05-15" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="invitedPhone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mobilni telefon</FormLabel>
                        <FormControl>
                          <Input placeholder="+381601234567" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="appointmentType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tip pregleda</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Izaberite tip" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="initial_consultation">Prvi pregled</SelectItem>
                            <SelectItem value="follow_up">Kontrola</SelectItem>
                            <SelectItem value="ultrasound">Ultrazvuk</SelectItem>
                            <SelectItem value="post_op">Postoperativna kontrola</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="doctorId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Doktor</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Izaberite doktora" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {doctors.map((d: { id: string; fullName: string }) => (
                              <SelectItem key={d.id} value={d.id}>
                                {d.fullName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="scheduledAt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Datum i vreme</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="flex justify-end pt-4">
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-appointment">
                    {createMutation.isPending ? 'Kreiram...' : 'Kreiraj i generiši link'}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </StaffLayout>
  );
}
