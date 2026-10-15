import { useStaffAuth } from '@/hooks/use-staff-auth';
import { StaffLayout, PageHeader } from '@/components/layout/staff-layout';
import { AppointmentStatusBadge, LabStatusBadge, LABS_WARNING_MESSAGE, StatusBadge, type Tone } from '@/components/status-badges';
import { EmptyState } from '@/components/empty-state';
import { AppointmentTypeSelect } from '@/components/appointment-type-select';
import { AnswersPanel } from '@/components/answers-panel';
import { SummaryPanel } from '@/components/summary-panel';
import { DOCUMENT_TYPE_LABELS, appointmentTypeLabel, hasLabsWarning, labelFor, questionnaireStatusLabel } from '@/lib/labels';
import {
  useGetAppointment,
  useCancelAppointment,
  useResendLink,
  useGetAppointmentSummaries,
  useGetDoctorDocuments,
  useUpdateAppointment,
  useReopenAppointment,
  getGetAppointmentQueryKey,
} from '@workspace/api-client-react';
import { useParams, Link } from 'wouter';
import type { ReactNode } from 'react';
import { format } from 'date-fns';
import { srLatn } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { copyTextToClipboard } from '@/lib/clipboard';
import { getDocumentDownload } from '@workspace/api-client-react';
import { normalizePersonName } from '@/lib/person-name';
import {
  Activity,
  AlertTriangle,
  Download,
  ExternalLink,
  FileText,
  Link as LinkIcon,
  Lock,
  Pencil,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const QUESTIONNAIRE_TONES: Record<string, Tone> = {
  not_started: 'neutral',
  consent_given: 'info',
  in_progress: 'info',
  saved: 'info',
  submitted: 'success',
  locked: 'neutral',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}


export default function AppointmentDetail() {
  const { id } = useParams();
  const { user } = useStaffAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: appointment, isLoading } = useGetAppointment(id || '', {
    query: {
      enabled: !!id,
      queryKey: getGetAppointmentQueryKey(id || ''),
    },
  });

  const canLoadClinical = !!id && user?.role === 'doctor';
  const { data: summaries } = useGetAppointmentSummaries(id || '', {
    query: {
      enabled: canLoadClinical,
      queryKey: ['appointmentSummaries', id],
    },
  });

  const { data: documentsData } = useGetDoctorDocuments(id || '', {
    query: {
      enabled: canLoadClinical,
      queryKey: ['appointmentDocuments', id],
    },
  });

  const cancelMutation = useCancelAppointment();
  const resendMutation = useResendLink();
  const updateMutation = useUpdateAppointment();
  const reopenMutation = useReopenAppointment();
  const [magicLink, setMagicLink] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ scheduledAt: '', appointmentType: '', invitedPhone: '' });

  if (isLoading) {
    return (
      <StaffLayout>
        <div className="space-y-4" aria-busy="true" aria-label="Učitavanje termina">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-72 max-w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </StaffLayout>
    );
  }

  if (!appointment) {
    return (
      <StaffLayout>
        <PageHeader back={{ href: '/dashboard', label: 'Dnevni pregled' }} title="Termin nije pronađen" />
        <Card>
          <EmptyState
            title="Ovaj termin ne postoji ili vam nije dostupan"
            description="Možda je obrisan, ili je link pogrešan. Vratite se na pregled termina."
            action={
              <Button asChild variant="outline">
                <Link href="/dashboard">Nazad na dnevni pregled</Link>
              </Button>
            }
          />
        </Card>
      </StaffLayout>
    );
  }

  const isAdmin = user?.role === 'clinic_admin' || user?.role === 'nurse';
  const isDoctor = user?.role === 'doctor';

  const startEdit = () => {
    setEditForm({
      scheduledAt: new Date(appointment.scheduledAt).toISOString().slice(0, 16),
      appointmentType: appointment.appointmentType,
      invitedPhone: appointment.invitedPhone || '',
    });
    setEditing(true);
  };

  const saveEdit = () => {
    updateMutation.mutate(
      {
        id: appointment.id,
        data: {
          scheduledAt: new Date(editForm.scheduledAt).toISOString(),
          appointmentType: editForm.appointmentType,
          invitedPhone: editForm.invitedPhone,
        },
      },
      {
        onSuccess: () => {
          toast({ title: 'Termin ažuriran' });
          setEditing(false);
          queryClient.invalidateQueries({ queryKey: getGetAppointmentQueryKey(appointment.id) });
        },
        onError: () =>
          toast({ title: 'Izmene nisu sačuvane', description: 'Proverite datum i telefon pa pokušajte ponovo.', variant: 'destructive' }),
      }
    );
  };

  const handleCancel = () => {
    cancelMutation.mutate(
      { id: appointment.id },
      {
        onSuccess: () => {
          toast({ title: 'Termin je otkazan', description: 'Link za pripremu više ne radi.' });
          queryClient.invalidateQueries({ queryKey: getGetAppointmentQueryKey(appointment.id) });
        },
        onError: () =>
          toast({ title: 'Otkazivanje nije uspelo', description: 'Pokušajte ponovo za nekoliko trenutaka.', variant: 'destructive' }),
      }
    );
  };

  const handleResend = () => {
    resendMutation.mutate(
      { id: appointment.id },
      {
        onSuccess: (res) => {
          toast({ title: 'Novi link je poslat pacijentu' });
          if (res.linkUrl) setMagicLink(res.linkUrl);
        },
        onError: () => toast({ title: 'Link nije poslat', description: 'Pokušajte ponovo.', variant: 'destructive' }),
      }
    );
  };

  const handleReopen = () => {
    reopenMutation.mutate(
      { id: appointment.id },
      {
        onError: () => toast({ title: 'Upitnik nije otvoren', description: 'Pokušajte ponovo.', variant: 'destructive' }),
        onSuccess: () => {
          toast({ title: 'Upitnik je ponovo otvoren', description: 'Pacijent može da menja odgovore.' });
          queryClient.invalidateQueries({ queryKey: getGetAppointmentQueryKey(appointment.id) });
        },
      }
    );
  };

  const copyText = async (text: string) => {
    try {
      await copyTextToClipboard(text);
      toast({ title: 'Kopirano' });
    } catch {
      toast({ title: 'Kopiranje nije uspelo', variant: 'destructive' });
    }
  };

  const openDocument = async (docId: string, disposition: 'inline' | 'attachment') => {
    // The server hands back a short-lived signed link — a plain URL, so every browser can open
    // or save it, iPhone included (it cannot open the in-memory blob links used before).
    // Phones: open in this tab (back returns here). Desktop: a new tab, opened inside the click
    // so it is not treated as a pop-up, then pointed at the file once the link arrives.
    const isPhone = window.matchMedia('(pointer: coarse)').matches;
    const viewWindow = disposition === 'inline' && !isPhone ? window.open('', '_blank') : null;

    try {
      const downloadInfo = await getDocumentDownload(id || '', docId);
      if (!downloadInfo.downloadUrl) {
        throw new Error('Missing download URL');
      }
      const fileUrl = `${downloadInfo.downloadUrl}?disposition=${disposition}`;

      if (viewWindow) {
        viewWindow.opener = null;
        viewWindow.location.href = fileUrl;
      } else {
        // Inline on a phone: the file opens in this tab. Attachment: the browser saves it and the page stays.
        window.location.assign(fileUrl);
      }
    } catch {
      viewWindow?.close();
      toast({
        title: 'Dokument nije otvoren',
        description: 'Proverite internet vezu i pokušajte ponovo.',
        variant: 'destructive',
      });
    }
  };

  const answers = appointment.questionnaire?.answers as Record<string, unknown> | undefined;
  const scheduledAt = new Date(appointment.scheduledAt);
  const longDate = format(scheduledAt, 'EEEE, d. MMMM yyyy.', { locale: srLatn });
  const isLocked = appointment.status === 'locked';
  const isCancelled = appointment.status === 'cancelled';
  const labsMissing = hasLabsWarning(appointment.appointmentType, appointment.labStatus);
  const documents = documentsData?.documents ?? [];

  const actions = (
    <>
      {isDoctor && appointment.patientId && (
        <Button asChild variant="outline">
          <Link href={`/patients/${appointment.patientId}/history`}>
            <Activity aria-hidden="true" />
            Istorija pacijenta
          </Link>
        </Button>
      )}
      {(isAdmin || isDoctor) && ['locked', 'submitted'].includes(appointment.status) && (
        <Button variant="outline" onClick={handleReopen} disabled={reopenMutation.isPending}>
          <RotateCcw aria-hidden="true" />
          Ponovo otvori upitnik
        </Button>
      )}
      {isAdmin && !isCancelled && (
        <>
          <Button variant="outline" onClick={startEdit}>
            <Pencil aria-hidden="true" />
            Izmeni termin
          </Button>
          <Button variant="outline" onClick={handleResend} disabled={resendMutation.isPending}>
            <LinkIcon aria-hidden="true" />
            {resendMutation.isPending ? 'Šaljem…' : 'Pošalji link ponovo'}
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="text-destructive hover:bg-destructive-soft">
                <XCircle aria-hidden="true" />
                Otkaži termin
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Otkazati termin za {normalizePersonName(appointment.invitedFullName)}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Link za pripremu će prestati da radi, a termin će biti označen kao otkazan. Ovo se ne može poništiti.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Zadrži termin</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleCancel}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Otkaži termin
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </>
  );

  return (
    <StaffLayout>
      <PageHeader
        back={{ href: '/dashboard', label: 'Dnevni pregled' }}
        title={normalizePersonName(appointment.invitedFullName)}
        description={
          <>
            {appointmentTypeLabel(appointment.appointmentType)} ·{' '}
            <time dateTime={scheduledAt.toISOString()}>
              {longDate.charAt(0).toUpperCase() + longDate.slice(1)} u {format(scheduledAt, 'HH:mm')}
            </time>
          </>
        }
        actions={actions}
      >
        <dl className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-lg border bg-border min-[420px]:grid-cols-2 lg:grid-cols-4">
          <StatusCell label="Priprema">
            <AppointmentStatusBadge status={appointment.status} />
          </StatusCell>
          <StatusCell label="Nalazi">
            {appointment.labStatus ? (
              <LabStatusBadge labStatus={appointment.labStatus} />
            ) : (
              <span className="text-base text-muted-foreground">Nije navedeno</span>
            )}
          </StatusCell>
          <StatusCell label="Upitnik">
            <StatusBadge
              tone={QUESTIONNAIRE_TONES[appointment.questionnaire?.status ?? 'not_started'] ?? 'neutral'}
              icon={FileText}
              label={appointment.questionnaire ? questionnaireStatusLabel(appointment.questionnaire.status) : 'Nije počet'}
            />
          </StatusCell>
          <StatusCell label="Izmene">
            {isLocked ? (
              <StatusBadge tone="neutral" icon={Lock} label="Zaključano" />
            ) : isCancelled ? (
              <StatusBadge tone="danger" icon={XCircle} label="Otkazano" />
            ) : (
              <StatusBadge tone="info" icon={Pencil} label="Pacijent može da menja" />
            )}
          </StatusCell>
        </dl>
      </PageHeader>

      <div className="space-y-4">
        {isLocked && (
          <Alert variant="info">
            <Lock aria-hidden="true" />
            <AlertTitle>Upitnik je zaključan</AlertTitle>
            <AlertDescription>
              Vreme pregleda je počelo, pa pacijent više ne može da menja odgovore. Ako nešto treba da se ispravi,
              izaberite „Ponovo otvori upitnik”.
            </AlertDescription>
          </Alert>
        )}

        {labsMissing && !isCancelled && (
          <Alert variant="warning">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Nalazi možda nedostaju</AlertTitle>
            <AlertDescription>{LABS_WARNING_MESSAGE}</AlertDescription>
          </Alert>
        )}

        {magicLink && (
          <Alert variant="info">
            <LinkIcon aria-hidden="true" />
            <AlertTitle>Novi link za pripremu</AlertTitle>
            <AlertDescription>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="min-w-0 flex-1 break-all rounded-md border bg-card px-3 py-2 font-mono text-sm">{magicLink}</code>
                <Button variant="outline" onClick={() => copyText(magicLink)}>
                  Kopiraj link
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {editing && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Izmena termina</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="edit-scheduled-at">Datum i vreme</Label>
                <Input
                  id="edit-scheduled-at"
                  type="datetime-local"
                  value={editForm.scheduledAt}
                  onChange={(e) => setEditForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Tip pregleda</Label>
                <AppointmentTypeSelect
                  value={editForm.appointmentType}
                  onChange={(value) => setEditForm((f) => ({ ...f, appointmentType: value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Telefon</Label>
                <Input
                  id="edit-phone"
                  type="tel"
                  inputMode="tel"
                  value={editForm.invitedPhone}
                  onChange={(e) => setEditForm((f) => ({ ...f, invitedPhone: e.target.value }))}
                />
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end md:col-span-3">
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Odustani
                </Button>
                <Button onClick={saveEdit} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Čuvam…' : 'Sačuvaj izmene'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {isAdmin && (
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Kontakt i termin</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y">
                <InfoRow label="Tip pregleda">{appointmentTypeLabel(appointment.appointmentType)}</InfoRow>
                <InfoRow label="Telefon">{appointment.invitedPhone || '–'}</InfoRow>
                <InfoRow label="Doktor">
                  {appointment.doctor?.fullName ? normalizePersonName(appointment.doctor.fullName) : '–'}
                </InfoRow>
                <InfoRow label="Pozivnica kreirana">
                  {appointment.createdAt ? format(new Date(appointment.createdAt), 'd. MMMM yyyy.', { locale: srLatn }) : '–'}
                </InfoRow>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Tok pripreme</CardTitle>
            </CardHeader>
            <CardContent>
              {appointment.questionnaire ? (
                <dl className="divide-y">
                  <InfoRow label="Saglasnost">
                    {appointment.questionnaire.consentGivenAt
                      ? format(new Date(appointment.questionnaire.consentGivenAt), 'd. MMM yyyy. HH:mm', { locale: srLatn })
                      : 'Nije data'}
                  </InfoRow>
                  <InfoRow label="Poslednje čuvanje">
                    {appointment.questionnaire.savedAt
                      ? format(new Date(appointment.questionnaire.savedAt), 'd. MMM yyyy. HH:mm', { locale: srLatn })
                      : '–'}
                  </InfoRow>
                  <InfoRow label="Poslato doktoru">
                    {appointment.questionnaire.submittedAt
                      ? format(new Date(appointment.questionnaire.submittedAt), 'd. MMM yyyy. HH:mm', { locale: srLatn })
                      : 'Još nije'}
                  </InfoRow>
                </dl>
              ) : (
                <p className="text-base text-muted-foreground">Pacijent još nije otvorio pripremu.</p>
              )}
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground md:col-span-2">
            Administracija vidi samo tok pripreme — odgovori iz upitnika i dokumenti su vidljivi samo doktoru.
          </p>
        </div>
      )}

      {isDoctor && (
        <Tabs defaultValue="summary" className="mt-8 w-full">
          <TabsList className="mb-4 w-full justify-start overflow-x-auto sm:w-auto">
            <TabsTrigger value="summary" className="flex-1 sm:flex-none">
              Sažeci
            </TabsTrigger>
            <TabsTrigger value="questionnaire" className="flex-1 sm:flex-none">
              Odgovori
            </TabsTrigger>
            <TabsTrigger value="documents" className="flex-1 sm:flex-none">
              Dokumenti <span className="tabular text-muted-foreground">{documents.length}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="mt-0">
            {summaries?.summaries && summaries.summaries.length > 0 ? (
              <Tabs defaultValue="current_visit" className="w-full">
                <TabsList className="mb-4 w-full justify-start overflow-x-auto bg-transparent p-0">
                  <TabsTrigger
                    value="current_visit"
                    className="border border-transparent data-[state=active]:border-border data-[state=active]:shadow-none"
                  >
                    Trenutna poseta
                  </TabsTrigger>
                  <TabsTrigger
                    value="current_visit_plus_history"
                    className="border border-transparent data-[state=active]:border-border data-[state=active]:shadow-none"
                  >
                    Poseta + istorija
                  </TabsTrigger>
                </TabsList>

                {(['current_visit', 'current_visit_plus_history'] as const).map((variant) => {
                  const summary = summaries.summaries.find((item) => item.variant === variant);
                  return (
                    <TabsContent key={variant} value={variant} className="mt-0">
                      {summary ? (
                        <SummaryPanel summary={summary} />
                      ) : (
                        <Card>
                          <EmptyState
                            icon={FileText}
                            title="Ovaj sažetak još nije napravljen"
                            description="Pojaviće se čim pacijent sačuva ili pošalje pripremu."
                          />
                        </Card>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            ) : (
              <Card>
                <EmptyState
                  icon={FileText}
                  title="Sažetak još ne postoji"
                  description="Pravi se automatski iz odgovora pacijenta, čim pacijent sačuva ili pošalje pripremu."
                />
              </Card>
            )}
          </TabsContent>

          <TabsContent value="questionnaire" className="mt-0">
            <p className="mb-4 max-w-prose text-base text-muted-foreground">
              Odgovori pacijenta, po sekcijama upitnika. Pitanja bez odgovora su prikazana, da se vidi šta nedostaje.
            </p>
            <AnswersPanel answers={answers} />
          </TabsContent>

          <TabsContent value="documents" className="mt-0">
            {documents.length > 0 ? (
              <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between md:px-6">
                    <div className="flex min-w-0 items-start gap-3">
                      <FileText className="mt-0.5 size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="break-words text-base font-medium">{doc.originalFileName}</p>
                        <p className="text-sm text-muted-foreground">
                          {doc.documentType ? labelFor(DOCUMENT_TYPE_LABELS, doc.documentType) : doc.mimeType} ·{' '}
                          {formatFileSize(doc.fileSizeBytes)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2 pl-9 sm:pl-0">
                      <Button variant="outline" size="sm" onClick={() => openDocument(doc.id, 'inline')}>
                        <ExternalLink aria-hidden="true" />
                        Otvori
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openDocument(doc.id, 'attachment')}>
                        <Download aria-hidden="true" />
                        Preuzmi
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Card>
                <EmptyState
                  icon={FileText}
                  title="Pacijent nije dodao dokumente"
                  description={
                    appointment.labStatus
                      ? 'Status nalaza je naveden iznad — pacijent ih možda donosi lično.'
                      : 'Pacijent još nije naveo da li ima nalaze.'
                  }
                />
              </Card>
            )}
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="size-4" aria-hidden="true" />
              Dokumenti pacijenta su samo za pregled i preuzimanje.
            </p>
          </TabsContent>
        </Tabs>
      )}
    </StaffLayout>
  );
}

function StatusCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 bg-card px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-base text-muted-foreground">{label}</dt>
      <dd className="text-base font-medium sm:text-right">{children}</dd>
    </div>
  );
}
