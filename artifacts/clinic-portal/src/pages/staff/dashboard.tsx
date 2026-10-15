import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { addDays, addYears, format, isSameDay, startOfDay, startOfToday, subYears } from 'date-fns';
import { srLatn } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, CircleHelp, Plus, Search, X } from 'lucide-react';
import { useListAppointments, type Appointment } from '@workspace/api-client-react';

import { useStaffAuth } from '@/hooks/use-staff-auth';
import { StaffLayout, PageHeader } from '@/components/layout/staff-layout';
import { AppointmentList, AppointmentListSkeleton, ListFrame } from '@/components/appointment-list';
import { EmptyState } from '@/components/empty-state';
import { AppointmentStatusBadge, LabStatusBadge, LabsWarningBadge } from '@/components/status-badges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_MEANINGS,
  LAB_STATUS_LABELS,
  LAB_STATUS_MEANINGS,
  hasLabsWarning,
} from '@/lib/labels';

/** "Sreda, 14. oktobar" — capitalised for display. */
function formatLongDay(date: Date): string {
  const value = format(date, 'EEEE, d. MMMM', { locale: srLatn });
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Phone width: "Danas, 15. okt" / "Pet, 16. okt". */
function formatShortDay(date: Date, isToday: boolean): string {
  const weekday = isToday ? 'Danas' : format(date, 'EEE', { locale: srLatn });
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)}, ${format(date, 'd. MMM', { locale: srLatn })}`;
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

/** 1 termin, 2 termina, 5 termina, 21 termin … */
function terminCount(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (last === 1 && lastTwo !== 11) return `${count} termin`;
  return `${count} termina`;
}

const PREPARED_STATUSES = ['submitted', 'locked'];

function StatusLegend() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="-mr-2 text-muted-foreground">
          <CircleHelp aria-hidden="true" />
          Šta znače oznake?
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(36rem,calc(100vw-2rem))] p-5">
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-3 text-base font-semibold">Priprema</h2>
            <ul className="space-y-3">
              {Object.keys(APPOINTMENT_STATUS_LABELS).map((value) => (
                <li key={value}>
                  <AppointmentStatusBadge status={value} />
                  <p className="mt-1 text-sm text-muted-foreground">{APPOINTMENT_STATUS_MEANINGS[value]}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-3 text-base font-semibold">Nalazi</h2>
            <ul className="space-y-3">
              {Object.keys(LAB_STATUS_LABELS).map((value) => (
                <li key={value}>
                  <LabStatusBadge labStatus={value} />
                  <p className="mt-1 text-sm text-muted-foreground">{LAB_STATUS_MEANINGS[value]}</p>
                </li>
              ))}
              <li>
                <LabsWarningBadge appointmentType="follow_up" labStatus={null} />
                <p className="mt-1 text-sm text-muted-foreground">
                  Za ovaj tip pregleda obično su potrebni skoriji nalazi, a pacijent još nije naveo da ih ima.
                </p>
              </li>
            </ul>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function Dashboard() {
  const { user } = useStaffAuth();
  const isDoctor = user?.role === 'doctor';
  const isAdmin = user?.role === 'clinic_admin';

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

  const query = normalize(search);
  const searching = query.length > 0;

  const applySearch = (items: Appointment[]) => {
    if (!searching) return items;
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
    const prepared = dayAppointments.filter((a) => PREPARED_STATUSES.includes(a.status)).length;
    return {
      total: dayAppointments.length,
      prepared,
      waiting: dayAppointments.length - prepared,
      labsWarning: dayAppointments.filter((a) => hasLabsWarning(a.appointmentType, a.labStatus)).length,
    };
  }, [dayAppointments]);

  /** Days that have appointments (dots in the calendar). */
  const busyDays = useMemo(() => list.map((appointment) => startOfDay(new Date(appointment.scheduledAt))), [list]);

  const isToday = isSameDay(selectedDate, new Date());
  const showDoctor = !isDoctor;

  const newInvitation = isAdmin ? (
    <Button asChild>
      <Link href="/appointments/new" data-testid="button-new-appointment">
        <Plus aria-hidden="true" />
        Nova pozivnica
      </Link>
    </Button>
  ) : null;

  const clearSearch = (
    <Button variant="outline" onClick={() => setSearch('')}>
      <X aria-hidden="true" />
      Obriši pretragu
    </Button>
  );

  const noMatch = (
    <ListFrame>
      <EmptyState
        icon={Search}
        title="Nijedan termin ne odgovara pretrazi"
        description={`Nema pacijenta čije ime ili telefon sadrži „${search.trim()}”.`}
        action={clearSearch}
      />
    </ListFrame>
  );

  return (
    <StaffLayout>
      <PageHeader title="Dnevni pregled" actions={newInvitation} />

      <Tabs defaultValue="day" className="w-full">
        <div className="mb-4 flex flex-col-reverse gap-3 md:flex-row md:items-center md:justify-between">
          <TabsList className="w-full justify-start overflow-x-auto md:w-auto">
            <TabsTrigger value="day" className="flex-1 md:flex-none">
              Dan <span className="tabular text-muted-foreground">{dayResults.length}</span>
            </TabsTrigger>
            <TabsTrigger value="upcoming" className="flex-1 md:flex-none">
              Predstojeći <span className="tabular text-muted-foreground">{upcomingResults.length}</span>
            </TabsTrigger>
            <TabsTrigger value="past" className="flex-1 md:flex-none">
              Prošli <span className="tabular text-muted-foreground">{pastResults.length}</span>
            </TabsTrigger>
          </TabsList>

          <div className="relative w-full md:w-80">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ime ili broj telefona"
              aria-label="Pretraži pacijente po imenu ili telefonu"
              className="pl-10 pr-11 [&::-webkit-search-cancel-button]:hidden"
            />
            {searching && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="Obriši pretragu"
                className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>

        <TabsContent value="day" className="mt-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Prethodni dan"
              onClick={() => setSelectedDate((date) => startOfDay(addDays(date, -1)))}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>

            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-0 flex-1 justify-start sm:flex-none sm:min-w-64">
                  <CalendarDays aria-hidden="true" />
                  <span className="truncate sm:hidden">{formatShortDay(selectedDate, isToday)}</span>
                  <span className="hidden truncate sm:inline">{formatLongDay(selectedDate)}</span>
                  {isToday && <span className="hidden text-muted-foreground sm:inline">· danas</span>}
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
                    busy: 'relative after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary',
                  }}
                />
                <p className="border-t px-3 py-2 text-sm text-muted-foreground">Tačka označava dan sa terminima.</p>
              </PopoverContent>
            </Popover>

            <Button
              variant="outline"
              size="icon"
              aria-label="Sledeći dan"
              onClick={() => setSelectedDate((date) => startOfDay(addDays(date, 1)))}
            >
              <ChevronRight aria-hidden="true" />
            </Button>

            {!isToday && (
              <Button variant="ghost" onClick={() => setSelectedDate(startOfToday())}>
                Danas
              </Button>
            )}
          </div>

          <div className="mb-4 flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1">
            {isLoading ? (
              <span className="text-base text-muted-foreground">Učitavanje…</span>
            ) : (
              <p className="text-base text-muted-foreground">
                <span className="font-medium text-foreground">{terminCount(dayStats.total)}</span>
                {dayStats.total > 0 && (
                  <>
                    {' · '}
                    {dayStats.prepared} pripremljeno · {dayStats.waiting} čeka pacijenta
                    {dayStats.labsWarning > 0 && (
                      <>
                        {' · '}
                        <span className="font-medium text-warning">{dayStats.labsWarning} bez nalaza</span>
                      </>
                    )}
                  </>
                )}
              </p>
            )}
            <StatusLegend />
          </div>

          {isLoading ? (
            <AppointmentListSkeleton />
          ) : dayResults.length > 0 ? (
            <AppointmentList appointments={dayResults} showDoctor={showDoctor} />
          ) : searching ? (
            noMatch
          ) : (
            <ListFrame>
              <EmptyState
                icon={CalendarDays}
                title={isToday ? 'Danas nema zakazanih termina' : 'Nema termina za ovaj dan'}
                description="Izaberite drugi dan u kalendaru ili pogledajte predstojeće termine."
                action={
                  <>
                    {!isToday && (
                      <Button variant="outline" onClick={() => setSelectedDate(startOfToday())}>
                        Prikaži današnje termine
                      </Button>
                    )}
                    {newInvitation}
                  </>
                }
              />
            </ListFrame>
          )}
        </TabsContent>

        <TabsContent value="upcoming" className="mt-0">
          {isLoading ? (
            <AppointmentListSkeleton />
          ) : upcomingResults.length > 0 ? (
            <AppointmentList appointments={upcomingResults} showDate showDoctor={showDoctor} />
          ) : searching ? (
            noMatch
          ) : (
            <ListFrame>
              <EmptyState
                icon={CalendarDays}
                title="Nema predstojećih termina"
                description={isAdmin ? 'Pošaljite pacijentu pozivnicu i termin će se pojaviti ovde.' : 'Novi termini će se pojaviti ovde čim ih klinika zakaže.'}
                action={newInvitation}
              />
            </ListFrame>
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-0">
          {isLoading ? (
            <AppointmentListSkeleton />
          ) : pastResults.length > 0 ? (
            <AppointmentList appointments={pastResults} showDate showDoctor={showDoctor} />
          ) : searching ? (
            noMatch
          ) : (
            <ListFrame>
              <EmptyState
                icon={CalendarDays}
                title="Nema prošlih termina"
                description="Ovde će biti termini koji su već održani, sa odgovorima i nalazima pacijenta."
              />
            </ListFrame>
          )}
        </TabsContent>
      </Tabs>
    </StaffLayout>
  );
}
