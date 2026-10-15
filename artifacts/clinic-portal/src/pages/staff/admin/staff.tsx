import { useStaffAuth } from '@/hooks/use-staff-auth';
import { StaffLayout, PageHeader } from '@/components/layout/staff-layout';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badges';
import { useListStaffUsers, useCreateStaffUser, getListStaffUsersQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, MinusCircle, Plus, Users } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { staffRoleLabel } from '@/lib/labels';
import { normalizePersonName } from '@/lib/person-name';

const schema = z.object({
  fullName: z.string().min(2, 'Ime i prezime su obavezni'),
  email: z.string().email('Unesite ispravnu email adresu'),
  password: z.string().min(12, 'Lozinka mora imati najmanje 12 karaktera'),
  role: z.enum(['doctor', 'clinic_admin', 'nurse']),
  phone: z.string().optional()
});

export default function AdminStaffList() {
  const { user } = useStaffAuth();
  const { data: staffList, isLoading } = useListStaffUsers({
    query: {
      enabled: user?.role === 'clinic_admin',
      queryKey: getListStaffUsersQueryKey()
    }
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const createMutation = useCreateStaffUser();

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', email: '', password: '', role: 'doctor', phone: '' }
  });

  const onSubmit = (values: z.infer<typeof schema>) => {
    createMutation.mutate({ data: { ...values, fullName: normalizePersonName(values.fullName) } }, {
      onSuccess: () => {
        toast({ title: 'Nalog je kreiran', description: 'Osoblje se može prijaviti sa dodeljenom lozinkom.' });
        queryClient.invalidateQueries({ queryKey: getListStaffUsersQueryKey() });
        setOpen(false);
        form.reset();
      },
      onError: (err: any) => {
        toast({ title: 'Nalog nije kreiran', description: err?.data?.error || 'Proverite podatke i pokušajte ponovo.', variant: 'destructive' });
      }
    });
  };

  if (user?.role !== 'clinic_admin') return null;

  const rows = Array.isArray(staffList) ? staffList : [];

  const addButton = (
    <Button onClick={() => setOpen(true)}>
      <Plus aria-hidden="true" />
      Dodaj osoblje
    </Button>
  );

  return (
    <StaffLayout>
      <PageHeader title="Osoblje" description="Nalozi doktora, sestara i administracije klinike." actions={addButton} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novi nalog</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="fullName" render={({ field }) => (
                <FormItem><FormLabel>Ime i prezime</FormLabel><FormControl><Input autoComplete="name" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="email" render={({ field }) => (
                <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" autoComplete="email" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField control={form.control} name="role" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Uloga</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="doctor">Doktor</SelectItem>
                        <SelectItem value="nurse">Medicinska sestra</SelectItem>
                        <SelectItem value="clinic_admin">Administrator</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="phone" render={({ field }) => (
                  <FormItem><FormLabel>Telefon (nije obavezno)</FormLabel><FormControl><Input type="tel" inputMode="tel" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Početna lozinka</FormLabel>
                  <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
                  <p className="text-sm text-muted-foreground">Najmanje 12 karaktera. Osoba je menja posle prve prijave.</p>
                  <FormMessage />
                </FormItem>
              )} />
              <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Kreiram…' : 'Kreiraj nalog'}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div className="overflow-hidden rounded-lg border bg-card">
        {isLoading ? (
          <div className="space-y-3 p-6" aria-busy="true">
            <div className="h-6 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-6 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Još nema naloga osoblja"
            description="Dodajte doktora ili sestru da bi mogli da se prijave i vide pripreme pacijenata."
            action={addButton}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Ime</TableHead>
                  <TableHead className="hidden sm:table-cell">Uloga</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Poslednja prijava</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((staff) => (
                  <TableRow key={staff.id}>
                    <TableCell>
                      <div className="font-medium">{normalizePersonName(staff.fullName)}</div>
                      <div className="break-all text-sm text-muted-foreground">{staff.email}</div>
                      <div className="text-sm text-muted-foreground sm:hidden">{staffRoleLabel(staff.role)}</div>
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap sm:table-cell">{staffRoleLabel(staff.role)}</TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={staff.isActive ? 'success' : 'neutral'}
                        icon={staff.isActive ? CheckCircle2 : MinusCircle}
                        label={staff.isActive ? 'Aktivan' : 'Neaktivan'}
                      />
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                      {staff.lastLoginAt ? format(new Date(staff.lastLoginAt), 'd. M. yyyy.') : 'Još se nije prijavio/la'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </StaffLayout>
  );
}
