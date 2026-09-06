import { useStaffAuth } from '@/hooks/use-staff-auth';
import { StaffLayout, AppointmentStatusBadge, LabStatusBadge } from '../dashboard';
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
import { format } from 'date-fns';
import { srLatn } from 'date-fns/locale';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { copyTextToClipboard } from '@/lib/clipboard';
import { getDocumentDownload } from '@workspace/api-client-react';
import {
  Calendar,
  Clock,
  FileText,
  Activity,
  Link as LinkIcon,
  Download,
  AlertTriangle,
  FileBox,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

function formatAnswerValue(val: unknown): string {
  if (Array.isArray(val)) {
    if (val.length === 0) return '–';
    if (typeof val[0] === 'object' && val[0] !== null) {
      return val
        .map((m) => {
          const row = m as { name?: string; dose?: string; frequency?: string };
          return [row.name, row.dose, row.frequency].filter(Boolean).join(' ');
        })
        .join('; ');
    }
    return val.join(', ');
  }
  if (typeof val === 'boolean') return val ? 'Da' : 'Ne';
  if (val == null || val === '') return '–';
  return String(val);
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
      <StaffLayout title="Detalj termina">
        <Skeleton className="h-[600px] w-full" />
      </StaffLayout>
    );
  }

  if (!appointment) {
    return (
      <StaffLayout title="Nije pronađeno">
        <p>Termin nije pronađen.</p>
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
        onError: () => toast({ title: 'Greška pri čuvanju', variant: 'destructive' }),
      }
    );
  };

  const handleCancel = () => {
    if (confirm('Otkazati ovaj termin? Link će biti deaktiviran.')) {
      cancelMutation.mutate(
        { id: appointment.id },
        {
          onSuccess: () => {
            toast({ title: 'Termin otkazan' });
            queryClient.invalidateQueries({ queryKey: getGetAppointmentQueryKey(appointment.id) });
          },
        }
      );
    }
  };

  const handleResend = () => {
    resendMutation.mutate(
      { id: appointment.id },
      {
        onSuccess: (res) => {
          toast({ title: 'Link generisan' });
          if (res.linkUrl) setMagicLink(res.linkUrl);
        },
      }
    );
  };

  const handleReopen = () => {
    reopenMutation.mutate(
      { id: appointment.id },
      {
        onSuccess: () => {
          toast({ title: 'Upitnik ponovo otvoren' });
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
    try {
      const downloadInfo = await getDocumentDownload(id || '', docId);
      if (!downloadInfo.downloadUrl) {
        throw new Error('Missing download URL');
      }

      const fileResponse = await fetch(`${downloadInfo.downloadUrl}?disposition=${disposition}`);
      if (!fileResponse.ok) {
        throw new Error('Failed to load document');
      }

      const fileBlob = await fileResponse.blob();
      const objectUrl = URL.createObjectURL(fileBlob);
      if (disposition === 'inline') {
        const viewWindow = window.open(objectUrl, '_blank', 'noopener,noreferrer');
        if (!viewWindow) {
          throw new Error('Popup blocked');
        }
      } else {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = downloadInfo.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      toast({ title: 'Nije moguće otvoriti dokument', variant: 'destructive' });
    }
  };

  const answers = appointment.questionnaire?.answers as Record<string, unknown> | undefined;

  return (
    <StaffLayout title={`Termin: ${appointment.invitedFullName}`}>
      <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
        <Button variant="outline" size="sm" className="gap-2" onClick={() => window.history.back()}>
          <span aria-hidden="true">←</span>
          Nazad
        </Button>
        {isDoctor && appointment.patientId && (
          <Link href={`/patients/${appointment.patientId}/history`}>
            <Button variant="outline" size="sm" className="gap-2">
              <Activity size={16} /> Istorija
            </Button>
          </Link>
        )}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{appointment.invitedFullName}</h2>
          <div className="flex items-center gap-4 mt-2 text-gray-600 flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar size={16} /> {format(new Date(appointment.scheduledAt), 'PPP', { locale: srLatn })}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={16} /> {format(new Date(appointment.scheduledAt), 'HH:mm')}
            </span>
            <AppointmentStatusBadge status={appointment.status} />
            <LabStatusBadge labStatus={appointment.labStatus} />
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {isDoctor && appointment.patientId && (
            <Link href={`/patients/${appointment.patientId}/history`}>
              <Button variant="outline" className="gap-2">
                <Activity size={16} /> Istorija pacijenta
              </Button>
            </Link>
          )}
          {(isAdmin || isDoctor) && ['locked', 'submitted'].includes(appointment.status) && (
            <Button variant="outline" onClick={handleReopen} disabled={reopenMutation.isPending}>
              Ponovo otvori upitnik
            </Button>
          )}
          {isAdmin && appointment.status !== 'cancelled' && (
            <>
              <Button variant="outline" onClick={startEdit}>
                Izmeni
              </Button>
              <Button variant="outline" onClick={handleResend} disabled={resendMutation.isPending} className="gap-2">
                <LinkIcon size={16} /> Pošalji link ponovo
              </Button>
              <Button variant="destructive" onClick={handleCancel} disabled={cancelMutation.isPending}>
                Otkaži
              </Button>
            </>
          )}
        </div>
      </div>

      {magicLink && (
        <Alert className="mb-6 border-blue-200 bg-blue-50">
          <LinkIcon className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800">Link za pripremu</AlertTitle>
          <AlertDescription className="mt-2">
            <div className="flex gap-2 items-center flex-wrap">
              <code className="bg-white p-2 rounded border border-blue-100 flex-1 text-sm break-all">{magicLink}</code>
              <Button variant="secondary" onClick={() => copyText(magicLink)}>
                Kopiraj
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {editing && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Izmena termina</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Datum i vreme</Label>
              <Input
                type="datetime-local"
                value={editForm.scheduledAt}
                onChange={(e) => setEditForm((f) => ({ ...f, scheduledAt: e.target.value }))}
              />
            </div>
            <div>
              <Label>Tip pregleda</Label>
              <Input
                value={editForm.appointmentType}
                onChange={(e) => setEditForm((f) => ({ ...f, appointmentType: e.target.value }))}
              />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input
                value={editForm.invitedPhone}
                onChange={(e) => setEditForm((f) => ({ ...f, invitedPhone: e.target.value }))}
              />
            </div>
            <div className="md:col-span-3 flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setEditing(false)}>
                Otkaži
              </Button>
              <Button onClick={saveEdit} disabled={updateMutation.isPending}>
                Sačuvaj
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Operativni podaci</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-gray-500">Tip pregleda:</span>
                <span className="font-medium">{appointment.appointmentType}</span>
                <span className="text-gray-500">Kontakt:</span>
                <span className="font-medium">{appointment.invitedPhone}</span>
                <span className="text-gray-500">Doktor:</span>
                <span className="font-medium">{appointment.doctor?.fullName || '–'}</span>
                <span className="text-gray-500">Kreirano:</span>
                <span className="font-medium">
                  {appointment.createdAt
                    ? format(new Date(appointment.createdAt), 'PPP', { locale: srLatn })
                    : '–'}
                </span>
                <span className="text-gray-500">Status nalaza:</span>
                <span className="font-medium">
                  <LabStatusBadge labStatus={appointment.labStatus} />
                </span>
              </div>
              <p className="text-xs text-gray-500 pt-2 border-t">
                Administracija ne vidi odgovore iz upitnika ni dokumente — samo operativni status.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Status pripreme</CardTitle>
            </CardHeader>
            <CardContent>
              {appointment.questionnaire ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle2 size={20} />
                    <span className="font-medium">Pokrenuto</span>
                  </div>
                  <div className="text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Saglasnost:</span>
                      <span>
                        {appointment.questionnaire.consentGivenAt
                          ? format(new Date(appointment.questionnaire.consentGivenAt), 'Pp', { locale: srLatn })
                          : 'Ne'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Poslednje čuvanje:</span>
                      <span>
                        {appointment.questionnaire.savedAt
                          ? format(new Date(appointment.questionnaire.savedAt), 'Pp', { locale: srLatn })
                          : '–'}
                      </span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span className="text-gray-500">Poslato:</span>
                      <span>
                        {appointment.questionnaire.submittedAt
                          ? format(new Date(appointment.questionnaire.submittedAt), 'Pp', { locale: srLatn })
                          : 'Na čekanju'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-orange-600">
                  <AlertTriangle size={20} />
                  <span>Pacijent još nije počeo.</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {isDoctor && (
        <Tabs defaultValue="summary" className="w-full">
          <TabsList className="bg-white border w-full justify-start rounded-b-none border-b-0 h-12 px-2 overflow-x-auto">
            <TabsTrigger value="summary" className="text-base py-2">
              Sažeci
            </TabsTrigger>
            <TabsTrigger value="questionnaire" className="text-base py-2">
              Odgovori
            </TabsTrigger>
            <TabsTrigger value="documents" className="text-base py-2">
              Dokumenti
            </TabsTrigger>
          </TabsList>

          <Card className="rounded-t-none border-t-0 shadow-none border-x border-b mb-8">
            <CardContent className="p-6">
              <TabsContent value="summary" className="m-0 mt-0">
                <p className="text-sm text-gray-500 mb-4">
                  Deterministički sažeci iz pacijent-prijavljenih podataka — nisu AI i nisu zvaničan medicinski izveštaj.
                </p>
                {summaries?.summaries && summaries.summaries.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {summaries.summaries.map((summary) => (
                      <div key={summary.id} className="bg-gray-50 p-6 rounded-xl border border-gray-100">
                        <div className="flex items-start justify-between gap-2 mb-4">
                          <h4 className="font-semibold text-lg text-primary flex items-center gap-2">
                            <FileText size={18} />
                            {summary.variant === 'current_visit'
                              ? 'Sažetak trenutne posete'
                              : 'Sažetak + relevantna istorija'}
                          </h4>
                          <Button variant="ghost" size="icon" onClick={() => copyText(summary.content)}>
                            <Copy size={16} />
                          </Button>
                        </div>
                        <p className="text-xs text-gray-500 mb-3">
                          Generisano: {format(new Date(summary.generatedAt), 'Pp', { locale: srLatn })}
                        </p>
                        <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">{summary.content}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <AlertTriangle className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                    <p>Sažetak će se pojaviti kada pacijent sačuva ili pošalje pripremu.</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="questionnaire" className="m-0 mt-0">
                {answers && Object.keys(answers).length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6 text-sm">
                    {Object.entries(answers).map(([key, val]) => (
                      <div key={key} className="border-b pb-3">
                        <div className="text-gray-500 mb-1 capitalize">{key.replace(/_/g, ' ')}</div>
                        <div className="font-medium whitespace-pre-wrap">{formatAnswerValue(val)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p>Pacijent još nije uneo odgovore.</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="documents" className="m-0 mt-0">
                {documentsData?.documents && documentsData.documents.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {documentsData.documents.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-4 border rounded-xl hover:border-primary/30 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                            <FileBox size={20} />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{doc.originalFileName}</p>
                            <p className="text-xs text-gray-500">
                              {(doc.fileSizeBytes / 1024 / 1024).toFixed(2)} MB • {doc.mimeType}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button variant="ghost" size="icon" title="Prikaži dokument" onClick={() => openDocument(doc.id, 'inline')}>
                            <FileText size={18} />
                          </Button>
                          <Button variant="ghost" size="icon" title="Preuzmi dokument" onClick={() => openDocument(doc.id, 'attachment')}>
                            <Download size={18} />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <p>Nema otpremljenih dokumenata za ovaj pregled.</p>
                  </div>
                )}
              </TabsContent>
            </CardContent>
          </Card>
        </Tabs>
      )}
    </StaffLayout>
  );
}
