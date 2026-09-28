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
import { DateOfBirthField } from '@/components/date-of-birth-field';
import { AppointmentTypeSelect } from '@/components/appointment-type-select';
import { PatientAutocomplete, type KnownPatient } from '@/components/patient-autocomplete';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, UserCheck } from 'lucide-react';
import { format } from 'date-fns';
import { srLatn } from 'date-fns/locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { copyTextToClipboard } from '@/lib/clipboard';
import { normalizePersonName } from '@/lib/person-name';

const formSchema = z.object({
  invitedFullName: z.string().min(2, 'Ime mora imati najmanje 2 karaktera'),
  invitedEmail: z.string().email('Unesite validnu email adresu'),
  invitedPhone: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Unesite validan broj telefona'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Izaberite datum rođenja (dan, mesec i godina)'),
  doctorId: z.string().min(1, 'Izaberite doktora'),
  appointmentType: z.string().min(1, 'Tip je obavezan'),
  scheduledAt: z.string().min(1, 'Datum i vreme su obavezni'),
});

const countryCodes = [
  ['RS', 'Srbija', '+381'], ['BA', 'Bosna i Hercegovina', '+387'], ['ME', 'Crna Gora', '+382'], ['HR', 'Hrvatska', '+385'],
  ['US', 'SAD', '+1'], ['GB', 'Ujedinjeno Kraljevstvo', '+44'], ['DE', 'Nemačka', '+49'], ['AT', 'Austrija', '+43'],
  ['CH', 'Švajcarska', '+41'], ['IT', 'Italija', '+39'], ['FR', 'Francuska', '+33'], ['ES', 'Španija', '+34'],
  ['NL', 'Holandija', '+31'], ['SE', 'Švedska', '+46'], ['NO', 'Norveška', '+47'], ['AU', 'Australija', '+61'],
  ['CA', 'Kanada', '+1'], ['TR', 'Turska', '+90'], ['SI', 'Slovenija', '+386'], ['MK', 'Severna Makedonija', '+389'],
  ['XK', 'Kosovo', '+383'], ['GR', 'Grčka', '+30'], ['HU', 'Mađarska', '+36'], ['RO', 'Rumunija', '+40'],
];

export default function NewAppointment() {
  const { user } = useStaffAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [matchedPatient, setMatchedPatient] = useState<KnownPatient | null>(null);
  const [countryCode, setCountryCode] = useState('+381');

  const { data: staffList } = useListStaffUsers({
    query: {
      enabled: user?.role === 'clinic_admin',
      queryKey: ['staffUsers'],
    },
  });
  const createMutation = useCreateAppointment();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    mode: 'onChange',
    defaultValues: {
      invitedFullName: '',
      invitedPhone: '+381',
      invitedEmail: '',
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

  /**
   * Selecting an existing patient fills every field the API exposes for admin/reception
   * (full name, phone, and date of birth when the linked patient record is returned).
   * E-mail is never returned by the current endpoints, so it is always confirmed manually —
   * and the duplicate check on the backend stays as the last line of defence.
   */
  const handleSelectPatient = (patient: KnownPatient) => {
    setMatchedPatient(patient);
    form.setValue('invitedFullName', normalizePersonName(patient.fullName), { shouldValidate: true });
    if (patient.phone) {
      const matchedCode = countryCodes.find(([, , code]) => patient.phone.startsWith(code));
      if (matchedCode) {
        setCountryCode(matchedCode[2]);
        form.setValue('invitedPhone', `${matchedCode[2]}${patient.phone.slice(matchedCode[2].length).replace(/\D/g, '')}`, { shouldValidate: true });
      } else form.setValue('invitedPhone', patient.phone, { shouldValidate: true });
    }
    if (patient.dateOfBirth) form.setValue('dateOfBirth', patient.dateOfBirth, { shouldValidate: true });
    if (patient.email) form.setValue('invitedEmail', patient.email, { shouldValidate: true });
    toast({
      title: 'Izabran postojeći pacijent',
      description: 'Poznati podaci pacijenta su popunjeni. Proverite ih pre slanja.',
    });
  };

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

  const clearForm = () => {
    form.reset({ invitedFullName: '', invitedPhone: '+381', invitedEmail: '', dateOfBirth: '', doctorId: '', appointmentType: 'follow_up', scheduledAt: new Date().toISOString().slice(0, 16) });
    setCountryCode('+381');
    setMatchedPatient(null);
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
              Unesite ime, email, telefon, datum rođenja, tip i vreme pregleda. Dok kucate ime, predlažemo
              pacijente koji već postoje u sistemu. Sistem generiše siguran link za pripremu i šalje ga
              pacijentu na email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="invitedFullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ime i prezime</FormLabel>
                      <FormControl>
                        <PatientAutocomplete
                          id={field.name}
                          value={field.value}
                          onChange={(value) => {
                            field.onChange(value);
                            if (matchedPatient && value !== matchedPatient.fullName) setMatchedPatient(null);
                          }}
                          onSelectPatient={handleSelectPatient}
                          onBlur={() => {
                            field.onBlur();
                            form.setValue('invitedFullName', normalizePersonName(form.getValues('invitedFullName')), { shouldValidate: true });
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {matchedPatient && (
                  <Alert className="border-blue-200 bg-blue-50 text-blue-900">
                    <UserCheck className="h-4 w-4" />
                    <AlertTitle>Postojeći pacijent u sistemu</AlertTitle>
                    <AlertDescription>
                      <p>
                        {normalizePersonName(matchedPatient.fullName)}
                        {matchedPatient.phone ? ` · ${matchedPatient.phone}` : ''} · poslednji termin{' '}
                        {format(new Date(matchedPatient.lastAppointmentAt), 'd. MMM yyyy.', { locale: srLatn })}
                      </p>
                      <p className="mt-1">
                        Popunjena su poznata polja. Datum rođenja i email proverite i po potrebi ispravite —
                        duplikat se dodatno proverava i pri čuvanju.
                      </p>
                    </AlertDescription>
                  </Alert>
                )}

                <FormField
                  control={form.control}
                  name="dateOfBirth"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Datum rođenja</FormLabel>
                      <FormControl>
                        <DateOfBirthField
                          value={field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          disabled={field.disabled}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <FormField
                    control={form.control}
                    name="invitedEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email pacijenta</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="petar.petrovic@example.com" {...field} onChange={(event) => { field.onChange(event); void form.trigger('invitedEmail'); }} />
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
                          <div className="flex gap-2">
                            <Select value={countryCode} onValueChange={(code) => { const nationalNumber = field.value.startsWith(countryCode) ? field.value.slice(countryCode.length) : field.value.replace(/^\+\d+/, ''); setCountryCode(code); field.onChange(`${code}${nationalNumber}`); void form.trigger('invitedPhone'); }}>
                              <SelectTrigger className="w-[170px] shrink-0"><SelectValue /></SelectTrigger>
                              <SelectContent>{countryCodes.map(([country, name, code]) => <SelectItem key={country} value={code}>{name} ({code})</SelectItem>)}</SelectContent>
                            </Select>
                            <Input inputMode="tel" type="tel" placeholder="601234567" value={field.value.startsWith(countryCode) ? field.value.slice(countryCode.length) : field.value} onChange={(event) => { field.onChange(`${countryCode}${event.target.value}`); void form.trigger('invitedPhone'); }} />
                          </div>
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
                        <AppointmentTypeSelect value={field.value} onChange={field.onChange} />
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
                                {normalizePersonName(d.fullName)}
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

                <div className="flex justify-between pt-4">
                  <Button type="button" variant="outline" onClick={clearForm}>Očisti sva polja</Button>
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
