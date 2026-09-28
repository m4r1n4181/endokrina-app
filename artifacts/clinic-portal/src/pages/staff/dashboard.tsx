import { Link, useLocation } from 'wouter';
import { useStaffAuth } from '@/hooks/use-staff-auth';
import { useListAppointments, type Appointment } from '@workspace/api-client-react';
import { addDays, addYears, format, isSameDay, startOfDay, startOfToday, startOfTomorrow, subYears } from 'date-fns';
import { srLatn } from 'date-fns/locale';
import { useMemo, useState } from 'react';
import { normalizePersonName } from '@/lib/person-name';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AppointmentStatusBadge, LabStatusBadge, LabsWarningBadge } from '@/components/status-badges';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_MEANINGS,
  LAB_STATUS_LABELS,
  LAB_STATUS_MEANINGS,
  appointmentTypeLabel,
  hasLabsWarning,
  staffRoleLabel,
} from '@/lib/labels';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  Stethoscope,
  Users,
  X,
} from 'lucide-react';

/** "sreda, 25. septembar 2026." — capitalize the first letter for display. */
function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatLongDay(date: Date): string {
  return capitalize(format(date, 'EEEE, d. MMMM yyyy.', { locale: srLatn }));
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'd')
    .trim();
}

export function StaffLayout({ children, title }: { children: React.ReactNode; title: string }) {
  const { user, logout } = useStaffAuth();
  const [location] = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // "Revizijski dnevnik" is intentionally NOT part of staff navigation anymore
  // (frontend visibility only — backend audit logging stays untouched and permanent).
  const navItems = [
    { label: 'Pregled', icon: LayoutDashboard, href: '/dashboard' },
    ...(user?.role === 'clinic_admin' ? [{ label: 'Osoblje', icon: Users, href: '/admin/staff' }] : []),
    { label: 'Bezbednost', icon: ShieldCheck, href: '/security' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <aside className="w-64 bg-primary text-primary-foreground flex-col hidden md:flex">
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
              {user?.fullName ? normalizePersonName(user.fullName).charAt(0) : 'U'}
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="text-sm font-medium truncate">{user?.fullName ? normalizePersonName(user.fullName) : ''}</div>
              <div className="text-xs text-primary-foreground/60">{staffRoleLabel(user?.role)}</div>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full border-white bg-white text-primary hover:bg-gray-100 hover:text-primary"
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
                        className="w-full border-white bg-white text-primary hover:bg-gray-100 hover:text-primary"
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
        <div className="p-4 md:p-6 flex-1 overflow-auto">
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

function AppointmentRow({ appointment, showDate = false }: { appointment: Appointment; showDate?: boolean }) {
  const scheduledAt = new Date(appointment.scheduledAt);

  return (
    <Link href={`/appointments/${appointment.id}`}>
      <Card className="hover:shadow-md transition-shadow cursor-pointer border border-gray-100 group">
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-700 flex flex-col items-center justify-center font-medium group-hover:bg-blue-100 transition-colors shrink-0">
            <span className="text-sm leading-none">{format(scheduledAt, 'HH')}</span>
            <span className="text-xs leading-none mt-0.5 opacity-70">{format(scheduledAt, 'mm')}</span>
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-gray-900 truncate">{normalizePersonName(appointment.invitedFullName)}</h3>
            <p className="text-sm text-gray-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span>{appointmentTypeLabel(appointment.appointmentType)}</span>
              <span className="w-1 h-1 rounded-full bg-gray-300" aria-hidden="true" />
              <span>
                {showDate
                  ? format(scheduledAt, 'd. MMM yyyy.', { locale: srLatn })
                  : `u ${format(scheduledAt, 'HH:mm')} h`}
              </span>
              {appointment.doctor?.fullName && (
                <>
                  <span className="w-1 h-1 rounded-full bg-gray-300" aria-hidden="true" />
                  <span>{normalizePersonName(appointment.doctor.fullName)}</span>
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 justify-end">
            <LabsWarningBadge appointmentType={appointment.appointmentType} labStatus={appointment.labStatus} />
            <LabStatusBadge labStatus={appointment.labStatus} />
            <AppointmentStatusBadge status={appointment.status} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Clock;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-12 bg-white rounded-xl border border-dashed text-gray-500">
      <Icon className="mx-auto h-12 w-12 text-gray-300 mb-3" aria-hidden="true" />
      <p className="font-medium text-gray-700">{title}</p>
      <p className="text-sm mt-1">{description}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useStaffAuth();
  const isDoctor = user?.role === 'doctor';

  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfToday());
  const [search, setSearch] = useState('');
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { data: appointments, isLoading } = useListAppointments(
    { doctorId: isDoctor ? user.id : undefined },
    { query: { queryKey: ['appointments', user?.id] } }
  );

  const list = useMemo(() => (Array.isArray(appointments) ? appointments : []), [appointments]);

  const { dayAppointments, upcoming, past } = useMemo(() => {
    const day: Appointment[] = [];
    const future: Appointment[] = [];
    const previous: Appointment[] = [];
    const tomorrow = startOfDay(addDays(selectedDate, 1));

    for (const appointment of list) {
      const scheduledAt = new Date(appointment.scheduledAt);
      if (isSameDay(scheduledAt, selectedDate)) day.push(appointment);
      else if (scheduledAt >= tomorrow) future.push(appointment);
      else previous.push(appointment);
    }

    const ascending = (a: Appointment, b: Appointment) =>
      new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();

    day.sort(ascending);
    future.sort(ascending);
    previous.sort(ascending).reverse();

    return { dayAppointments: day, upcoming: future, past: previous };
  }, [list, selectedDate]);

  const applySearch = (items: Appointment[]) => {
    const query = normalize(search);
    if (!query) return items;
    const digits = query.replace(/\D/g, '');
    return items.filter(
      (appointment) =>
        normalize(appointment.invitedFullName).includes(query) ||
        (digits.length > 0 && appointment.invitedPhone.replace(/\D/g, '').includes(digits))
    );
  };

  const dayResults = applySearch(dayAppointments);
  const upcomingResults = applySearch(upcoming);
  const pastResults = applySearch(past);

  const dayStats = useMemo(() => {
    const prepared = dayAppointments.filter((a) => ['submitted', 'locked'].includes(a.status)).length;
    return {
      total: dayAppointments.length,
      prepared,
      pending: dayAppointments.length - prepared,
      labsWarning: dayAppointments.filter((a) => hasLabsWarning(a.appointmentType, a.labStatus)).length,
    };
  }, [dayAppointments]);

  const overallPrepared = useMemo(
    () => list.filter((a) => ['submitted', 'locked'].includes(a.status)).length,
    [list]
  );

  /** Days that already have appointments (dots in the calendar). */
  const busyDays = useMemo(
    () => list.map((appointment) => startOfDay(new Date(appointment.scheduledAt))),
    [list]
  );

  const searching = normalize(search).length > 0;

  return (
    <StaffLayout title="Dnevni pregled">
      {user?.role === 'clinic_admin' && (
        <div className="mb-4 flex justify-end">
          <Link href="/appointments/new">
            <Button className="gap-2" data-testid="button-new-appointment">
              <Plus size={16} />
              Nova pozivnica
            </Button>
          </Link>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Prethodni dan"
            onClick={() => setSelectedDate((date) => startOfDay(addDays(date, -1)))}
          >
            <ChevronLeft size={16} />
          </Button>

          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2 min-w-[15rem] justify-start font-medium">
                <CalendarDays size={16} />
                {formatLongDay(selectedDate)}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <CalendarPicker
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  if (date) {
                    setSelectedDate(startOfDay(date));
                    setCalendarOpen(false);
                  }
                }}
                locale={srLatn}
                captionLayout="dropdown"
                startMonth={subYears(new Date(), 3)}
                endMonth={addYears(new Date(), 2)}
                modifiers={{ busy: busyDays }}
                modifiersClassNames={{
                  busy: 'relative after:absolute after:bottom-0.5 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary',
                }}
                className="rounded-md border"
              />
              <p className="border-t px-3 py-2 text-xs text-gray-500">
                Tačkica označava dan sa zakazanim terminima.
              </p>
            </PopoverContent>
          </Popover>

          <Button
            variant="outline"
            size="icon"
            aria-label="Sledeći dan"
            onClick={() => setSelectedDate((date) => startOfDay(addDays(date, 1)))}
          >
            <ChevronRight size={16} />
          </Button>

          {!isSameDay(selectedDate, new Date()) && (
            <Button variant="ghost" onClick={() => setSelectedDate(startOfToday())}>
              Danas
            </Button>
          )}
        </div>

        <div className="relative w-full lg:w-72">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pretraži po imenu ili telefonu"
            aria-label="Pretraga pacijenata"
            className="pl-9 pr-9"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Obriši pretragu"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DayStatCard label="Termina u danu" value={dayStats.total} icon={CalendarDays} isLoading={isLoading} tone="blue" />
        <DayStatCard label="Priprema poslata" value={dayStats.prepared} icon={CheckCircle2} isLoading={isLoading} tone="green" />
        <DayStatCard label="Čeka pacijenta" value={dayStats.pending} icon={Clock} isLoading={isLoading} tone="orange" />
        <DayStatCard label="Upozorenja o nalazima" value={dayStats.labsWarning} icon={AlertTriangle} isLoading={isLoading} tone="amber" />
      </div>

      <p className="mt-3 text-xs text-gray-500">
        Ukupno u sistemu: {list.length} {list.length === 1 ? 'termin' : 'termina'}, priprema poslata za{' '}
        {overallPrepared}.
      </p>

      <Collapsible className="mt-3">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2 px-0 text-gray-600 hover:bg-transparent">
            <Info size={14} aria-hidden="true" />
            Šta znače oznake statusa?
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 rounded-xl border bg-white p-4">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Status pripreme
              </h4>
              <ul className="space-y-2 text-sm text-gray-600">
                {Object.entries(APPOINTMENT_STATUS_LABELS).map(([value, label]) => (
                  <li key={value} className="flex items-start gap-2">
                    <AppointmentStatusBadge status={value} className="shrink-0" />
                    <span className="text-xs leading-5">{APPOINTMENT_STATUS_MEANINGS[value]}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Status nalaza
              </h4>
              <ul className="space-y-2 text-sm text-gray-600">
                {Object.entries(LAB_STATUS_LABELS).map(([value, label]) => (
                  <li key={value} className="flex items-start gap-2">
                    <LabStatusBadge labStatus={value} className="shrink-0" />
                    <span className="text-xs leading-5">{LAB_STATUS_MEANINGS[value]}</span>
                  </li>
                ))}
                <li className="flex items-start gap-2">
                  <LabsWarningBadge appointmentType="follow_up" labStatus={null} className="shrink-0" />
                  <span className="text-xs leading-5">
                    Za ovaj tip pregleda obično su potrebni skoriji nalazi, a pacijent ih još nije
                    obezbedio.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Tabs defaultValue="day" className="mt-6 w-full">
        <TabsList className="mb-4 flex w-full justify-start gap-1 overflow-x-auto bg-white border">
          <TabsTrigger value="day" className="data-[state=active]:bg-primary data-[state=active]:text-white">
            Izabrani dan ({dayResults.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="data-[state=active]:bg-primary data-[state=active]:text-white">
            Predstojeći ({upcomingResults.length})
          </TabsTrigger>
          <TabsTrigger value="past" className="data-[state=active]:bg-primary data-[state=active]:text-white">
            Prošli ({pastResults.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="day" className="space-y-3">
          {dayStats.labsWarning > 0 && !searching && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
              <span>
                {dayStats.labsWarning === 1
                  ? 'Na jednom terminu u ovom danu nalazi možda nedostaju.'
                  : `Na ${dayStats.labsWarning} termina u ovom danu nalazi možda nedostaju.`}{' '}
                Bez nalaza doktor možda neće moći da završi kompletnu procenu.
              </span>
            </div>
          )}

          {isLoading ? (
            Array(3)
              .fill(0)
              .map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-xl" />)
          ) : dayResults.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="Nema termina za izabrani dan."
              description={searching ? 'Nijedan termin ne odgovara pretrazi.' : 'Izaberite drugi dan u kalendaru.'}
              action={
                !isSameDay(selectedDate, new Date()) ? (
                  <Button variant="outline" onClick={() => setSelectedDate(startOfToday())}>
                    Prikaži današnje termine
                  </Button>
                ) : undefined
              }
            />
          ) : (
            dayResults.map((appointment) => <AppointmentRow key={appointment.id} appointment={appointment} />)
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="space-y-3">
          {isLoading ? (
            Array(3)
              .fill(0)
              .map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-xl" />)
          ) : upcomingResults.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Nema predstojećih termina."
              description={searching ? 'Nijedan termin ne odgovara pretrazi.' : 'Novi termini će se pojaviti ovde.'}
            />
          ) : (
            upcomingResults.map((appointment) => (
              <AppointmentRow key={appointment.id} appointment={appointment} showDate />
            ))
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-3">
          {isLoading ? (
            Array(3)
              .fill(0)
              .map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-xl" />)
          ) : pastResults.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Nema prošlih termina."
              description={searching ? 'Nijedan termin ne odgovara pretrazi.' : 'Istorija pacijenta je dostupna sa kartice termina.'}
            />
          ) : (
            pastResults.map((appointment) => (
              <AppointmentRow key={appointment.id} appointment={appointment} showDate />
            ))
          )}
        </TabsContent>
      </Tabs>
    </StaffLayout>
  );
}

function DayStatCard({
  label,
  value,
  icon: Icon,
  isLoading,
  tone,
}: {
  label: string;
  value: number;
  icon: typeof Clock;
  isLoading: boolean;
  tone: 'blue' | 'green' | 'orange' | 'amber';
}) {
  const tones: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-50',
    green: 'text-green-600 bg-green-50',
    orange: 'text-orange-600 bg-orange-50',
    amber: 'text-amber-700 bg-amber-50',
  };

  return (
    <Card className="shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
          <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tones[tone]}`}>
            <Icon size={15} aria-hidden="true" />
          </span>
          <span className="min-w-0">{label}</span>
        </div>
        <div className="mt-2 text-2xl font-bold text-gray-800">
          {isLoading ? <Skeleton className="h-8 w-12" /> : value}
        </div>
      </CardContent>
    </Card>
  );
}


