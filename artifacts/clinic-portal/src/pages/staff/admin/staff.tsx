import { useStaffAuth } from '@/hooks/use-staff-auth';
import { StaffLayout } from '../dashboard';
import { useListStaffUsers, useCreateStaffUser, getListStaffUsersQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Users, Shield, UserCircle, Activity } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const schema = z.object({
  fullName: z.string().min(2, "Name required"),
  email: z.string().email(),
  password: z.string().min(12, "Min 12 chars"),
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
    createMutation.mutate({ data: values }, {
      onSuccess: () => {
        toast({ title: 'User created' });
        queryClient.invalidateQueries({ queryKey: getListStaffUsersQueryKey() });
        setOpen(false);
        form.reset();
      },
      onError: (err: any) => {
        toast({ title: 'Kreiranje nije uspelo', description: err?.data?.error || 'Greška', variant: 'destructive' });
      }
    });
  };

  if (user?.role !== 'clinic_admin') return null;

  const rows = Array.isArray(staffList) ? staffList : [];

  return (
    <StaffLayout title="Upravljanje osobljem">
      <div className="flex justify-between items-center mb-6">
        <p className="text-gray-600">Uloge i nalozi osoblja klinike.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus size={16} /> Dodaj osoblje</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novi nalog</DialogTitle></DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="fullName" render={({ field }) => (
                  <FormItem><FormLabel>Ime i prezime</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem><FormLabel>Email</FormLabel><FormControl><Input type="email" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="role" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Uloga</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="doctor">Doktor</SelectItem>
                          <SelectItem value="nurse">Medicinska sestra</SelectItem>
                          <SelectItem value="clinic_admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="phone" render={({ field }) => (
                    <FormItem><FormLabel>Telefon (opciono)</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem><FormLabel>Početna lozinka</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>Sačuvaj</Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-gray-50">
              <TableRow>
                <TableHead>Ime</TableHead>
                <TableHead>Uloga</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Poslednja prijava</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((staff) => (
                <TableRow key={staff.id}>
                  <TableCell>
                    <div className="font-medium text-gray-900">{staff.fullName}</div>
                    <div className="text-xs text-gray-500">{staff.email}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm capitalize">
                      {staff.role === 'clinic_admin' ? <Shield size={14} className="text-red-500" /> : <UserCircle size={14} className="text-blue-500" />}
                      {staff.role.replace('_', ' ')}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={staff.isActive ? 'default' : 'secondary'} className={staff.isActive ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}>
                      {staff.isActive ? 'Aktivan' : 'Neaktivan'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {staff.lastLoginAt ? format(new Date(staff.lastLoginAt), 'dd.MM.yyyy') : 'Nikad'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </StaffLayout>
  );
}
