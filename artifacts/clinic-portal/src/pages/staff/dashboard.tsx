import { Link, useLocation } from 'wouter';
import { useStaffAuth } from '@/hooks/use-staff-auth';
import { useListAppointments, Appointment } from '@workspace/api-client-react';
import { format, isToday, isFuture } from 'date-fns';
import { srLatn } from 'date-fns/locale';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Stethoscope, Calendar, Plus, Clock, Users, Activity, FileText, LayoutDashboard, Menu, ChevronLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from '@/components/ui/sheet';

const LAB_LABELS: Record<string, string> = {
  uploaded_digitally: 'Nalazi otpremljeni',
  will_bring_physical: 'Doneće fizički',
  results_pending: 'Nalazi na čekanju',
  no_results_available: 'Nema nalaza',
  not_required: 'Nije potrebno',
};

const STATUS_LABELS: Record<string, string> = {
  draft_invitation: 'Nacrt',
  link_sent: 'Link poslat',
  opened: 'Otvoreno',
  in_progress: 'U toku',
  submitted: 'Poslato',
  locked: 'Zaključano',
  reopened: 'Ponovo otvoreno',
  rescheduled: 'Pomereno',
  cancelled: 'Otkazano',
};

export function StaffLayout({ children, title }: { children: React.ReactNode; title: string }) {
  const { user, logout } = useStaffAuth();
  const [location] = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems = [
    { label: 'Pregled', icon: LayoutDashboard, href: '/dashboard' },
    ...(user?.role === 'clinic_admin' || user?.role === 'doctor'
      ? [
          ...(user?.role === 'clinic_admin'
            ? [{ label: 'Osoblje', icon: Users, href: '/admin/staff' }]
            : []),
          { label: 'Revizijski dnevnik', icon: FileText, href: '/admin/audit' },
        ]
      : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-64 bg-primary text-primary-foreground flex flex-col hidden md:flex">
        <div className="p-6 flex items-center gap-3 border-b border-primary-foreground/10">
          <Stethoscope size={24} className="text-blue-200" />
          <span className="font-serif text-xl font-medium tracking-tight">
            Klinika<span className="text-blue-200">Portal</span>
          </span>
        </div>

        <nav className="flex-1 py-6 px-3 space-y-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              <div
                className={`flex items-center gap-3 px-3 py-2 rounded-md hover:bg-white/10 transition-colors cursor-pointer ${
                  location.startsWith(item.href) ? 'bg-white/10 font-medium' : 'text-primary-foreground/80'
                }`}
              >
                <item.icon size={18} />
                {item.label}
              </div>
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-primary-foreground/10">
          <div className="flex items-center gap-3 mb-4 px-2">
            <div className="w-8 h-8 rounded-full bg-blue-400/20 flex items-center justify-center font-medium">
              {user?.fullName?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-medium truncate">{user?.fullName}</div>
              <div className="text-xs text-primary-foreground/60 capitalize">{user?.role?.replace('_', ' ')}</div>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full border-primary-foreground/20 text-primary hover:bg-white/10 hover:text-white"
            onClick={logout}
          >
            Odjavi se
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b px-4 md:px-6 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <div className="md:hidden">
              <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Otvori meni">
                    <Menu size={18} />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[18rem] p-0 bg-primary text-primary-foreground border-r-0">
                  <SheetHeader className="p-6 border-b border-primary-foreground/10 text-left">
                    <SheetTitle className="text-primary-foreground">KlinikaPortal</SheetTitle>
                    <SheetDescription className="text-primary-foreground/70">Brza navigacija</SheetDescription>
                  </SheetHeader>
                  <div className="flex flex-col h-[calc(100%-8.5rem)]">
                    <nav className="flex-1 py-4 px-3 space-y-1">
                      {navItems.map((item) => (
                        <Link key={item.href} href={item.href}>
                          <div
                            onClick={() => setMobileNavOpen(false)}
                            className={`flex items-center gap-3 px-3 py-3 rounded-md hover:bg-white/10 transition-colors cursor-pointer ${
                              location.startsWith(item.href) ? 'bg-white/10 font-medium' : 'text-primary-foreground/80'
                            }`}
                          >
                            <item.icon size={18} />
                            {item.label}
                          </div>
                        </Link>
                      ))}
                    </nav>
                    <div className="p-4 border-t border-primary-foreground/10">
                      <Button
                        variant="outline"
                        className="w-full border-primary-foreground/20 text-primary hover:bg-white/10 hover:text-white"
                        onClick={() => {
                          setMobileNavOpen(false);
                          logout();
                        }}
                      >
                        Odjavi se
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
            <h1 className="text-lg md:text-xl font-medium text-gray-800 truncate">{title}</h1>
          </div>
          <div className="hidden md:flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-2 text-gray-600 hover:text-gray-900" onClick={() => window.history.back()}>
              <ChevronLeft size={16} /> Nazad
            </Button>
          </div>
        </header>
        <div className="p-6 flex-1 overflow-auto">
          <div className="max-w-6xl mx-auto">
            <p className="text-xs text-gray-500 mb-4">
              Ova platforma nije zvanična medicinska evidencija (EMR). Klinički sadržaj vidi samo doktor.
            </p>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

export function AppointmentStatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    draft_invitation: 'outline',
    link_sent: 'secondary',
    opened: 'secondary',
    in_progress: 'secondary',
    submitted: 'default',
    locked: 'default',
    reopened: 'secondary',
    rescheduled: 'outline',
    cancelled: 'destructive',
  };

  return (
    <Badge
      variant={variants[status] || 'outline'}
      className={variants[status] === 'secondary' ? 'bg-blue-100 text-blue-800 hover:bg-blue-100' : ''}
    >
      {STATUS_LABELS[status] || status}
    </Badge>
  );
}

export function LabStatusBadge({ labStatus }: { labStatus?: string | null }) {
  if (!labStatus) return null;
  const warning = labStatus === 'no_results_available' || labStatus === 'results_pending';
  return (
    <Badge variant="outline" className={warning ? 'border-amber-300 text-amber-800 bg-amber-50' : 'bg-gray-50'}>
      {LAB_LABELS[labStatus] || labStatus}
    </Badge>
  );
}

export default function Dashboard() {
  const { user } = useStaffAuth();
  const { data: appointments, isLoading } = useListAppointments(
    {
      doctorId: user?.role === 'doctor' ? user.id : undefined,
    },
    { query: { queryKey: ['appointments', user?.id] } }
  );

  const list = Array.isArray(appointments) ? appointments : [];

  const { today, upcoming, past } = useMemo(() => {
    return list.reduce(
      (acc, appt) => {
        const date = new Date(appt.scheduledAt);
        if (isToday(date)) acc.today.push(appt);
        else if (isFuture(date)) acc.upcoming.push(appt);
        else acc.past.push(appt);
        return acc;
      },
      { today: [] as Appointment[], upcoming: [] as Appointment[], past: [] as Appointment[] }
    );
  }, [list]);

  const stats = useMemo(() => {
    const submitted = list.filter((a) => ['submitted', 'locked'].includes(a.status)).length;
    return {
      total: list.length,
      submitted,
      pending: list.length - submitted,
    };
  }, [list]);

  return (
    <StaffLayout title="Dnevni pregled">
      {user?.role === 'clinic_admin' && (
        <div className="mb-6 flex justify-end">
          <Link href="/appointments/new">
            <Button className="gap-2" data-testid="button-new-appointment">
              <Plus size={16} />
              Nova pozivnica
            </Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="shadow-sm border-blue-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Calendar size={16} /> Ukupno termina
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{isLoading ? <Skeleton className="h-9 w-16" /> : stats.total}</div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-green-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Activity size={16} /> Priprema poslata
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-700">
              {isLoading ? <Skeleton className="h-9 w-16" /> : stats.submitted}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm border-orange-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Clock size={16} /> Čeka pacijenta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {isLoading ? <Skeleton className="h-9 w-16" /> : stats.pending}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="today" className="w-full">
        <TabsList className="mb-6 bg-white border">
          <TabsTrigger value="today" className="data-[state=active]:bg-primary data-[state=active]:text-white">
            Danas ({today.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming">Predstojeći ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">Prošli ({past.length})</TabsTrigger>
        </TabsList>

        {(['today', 'upcoming', 'past'] as const).map((tab) => {
          const tabList = tab === 'today' ? today : tab === 'upcoming' ? upcoming : past;
          return (
            <TabsContent key={tab} value={tab} className="space-y-4">
              {isLoading ? (
                Array(3)
                  .fill(0)
                  .map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)
              ) : tabList.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-xl border border-dashed text-gray-400">
                  <Calendar className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                  <p>Nema termina u ovom prikazu.</p>
                </div>
              ) : (
                tabList.map((appt) => (
                  <Link key={appt.id} href={`/appointments/${appt.id}`}>
                    <Card className="hover:shadow-md transition-shadow cursor-pointer border border-gray-100 group">
                      <CardContent className="p-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-700 flex flex-col items-center justify-center font-medium group-hover:bg-blue-100 transition-colors shrink-0">
                            <span className="text-sm leading-none">{format(new Date(appt.scheduledAt), 'HH')}</span>
                            <span className="text-xs leading-none mt-0.5 opacity-70">
                              {format(new Date(appt.scheduledAt), 'mm')}
                            </span>
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-medium text-gray-900 truncate">{appt.invitedFullName}</h3>
                            <p className="text-sm text-gray-500 flex items-center gap-2 flex-wrap">
                              <span>{appt.appointmentType}</span>
                              <span className="w-1 h-1 rounded-full bg-gray-300" />
                              <span>{format(new Date(appt.scheduledAt), 'd. MMM yyyy.', { locale: srLatn })}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap justify-end">
                          <LabStatusBadge labStatus={appt.labStatus} />
                          <AppointmentStatusBadge status={appt.status} />
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </StaffLayout>
  );
}
