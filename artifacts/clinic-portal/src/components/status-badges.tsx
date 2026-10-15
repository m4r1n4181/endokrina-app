/**
 * Shared status/lab badges (UX requirements, table 6 — dashboard status badges).
 * Every badge renders a Serbian label; raw enum values are never shown.
 * Used on the dashboard, appointment detail and patient history so the colours,
 * icons and wording stay consistent everywhere.
 *
 * Colour comes only from the theme's semantic pairs:
 *   neutral  — nothing to act on (not opened, locked, not required)
 *   info     — patient is working on it
 *   success  — done / documents uploaded
 *   warning  — labs may be missing, rescheduled
 *   danger   — cancelled
 */
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileCheck2,
  FileText,
  FolderInput,
  Hourglass,
  Lock,
  MailOpen,
  MinusCircle,
  RotateCcw,
  Send,
  XCircle,
} from 'lucide-react';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_MEANINGS,
  LAB_STATUS_LABELS,
  LAB_STATUS_MEANINGS,
  hasLabsWarning,
  labelFor,
} from '@/lib/labels';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'border-border bg-muted text-muted-foreground',
  info: 'border-info-border bg-info-soft text-info',
  success: 'border-success-border bg-success-soft text-success',
  warning: 'border-warning-border bg-warning-soft text-warning',
  danger: 'border-destructive-border bg-destructive-soft text-destructive',
};

const STATUS_TONES: Record<string, Tone> = {
  draft_invitation: 'neutral',
  link_sent: 'neutral',
  opened: 'info',
  in_progress: 'info',
  submitted: 'success',
  locked: 'neutral',
  reopened: 'info',
  rescheduled: 'warning',
  cancelled: 'danger',
};

const STATUS_ICONS: Record<string, typeof Clock> = {
  draft_invitation: FileText,
  link_sent: Send,
  opened: MailOpen,
  in_progress: Clock,
  submitted: CheckCircle2,
  locked: Lock,
  reopened: RotateCcw,
  rescheduled: CalendarClock,
  cancelled: XCircle,
};

export function StatusBadge({
  tone,
  icon: Icon,
  label,
  title,
  className,
}: {
  tone: Tone;
  icon?: typeof Clock;
  label: string;
  title?: string;
  className?: string;
}) {
  return (
    <Badge variant="outline" title={title} className={cn(TONE_CLASSES[tone], className)}>
      {Icon && <Icon aria-hidden="true" />}
      {label}
    </Badge>
  );
}

export function AppointmentStatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <StatusBadge
      tone={STATUS_TONES[status] ?? 'neutral'}
      icon={STATUS_ICONS[status] ?? Clock}
      label={labelFor(APPOINTMENT_STATUS_LABELS, status)}
      title={APPOINTMENT_STATUS_MEANINGS[status]}
      className={className}
    />
  );
}

const LAB_TONES: Record<string, Tone> = {
  uploaded_digitally: 'success',
  will_bring_physical: 'info',
  results_pending: 'warning',
  no_results_available: 'warning',
  not_required: 'neutral',
};

const LAB_ICONS: Record<string, typeof Clock> = {
  uploaded_digitally: FileCheck2,
  will_bring_physical: FolderInput,
  results_pending: Hourglass,
  no_results_available: AlertTriangle,
  not_required: MinusCircle,
};

export function LabStatusBadge({ labStatus, className }: { labStatus?: string | null; className?: string }) {
  if (!labStatus) return null;
  return (
    <StatusBadge
      tone={LAB_TONES[labStatus] ?? 'neutral'}
      icon={LAB_ICONS[labStatus] ?? FileText}
      label={labelFor(LAB_STATUS_LABELS, labStatus)}
      title={LAB_STATUS_MEANINGS[labStatus]}
      className={className}
    />
  );
}

export const LABS_WARNING_MESSAGE =
  'Za ovaj tip pregleda obično su potrebni skoriji laboratorijski nalazi. Bez njih doktor možda neće moći da završi kompletnu procenu.';

/**
 * "Strong warning" badge — labs (possibly) missing for an appointment type that needs them.
 * Copy is deliberately calm: it explains the consequence, it does not block anything.
 * Shown only when the lab status itself does not already say so (no duplicate badges).
 */
export function LabsWarningBadge({
  appointmentType,
  labStatus,
  className,
}: {
  appointmentType?: string | null;
  labStatus?: string | null;
  className?: string;
}) {
  // A pending / "no results" lab status is already shown in warning colour by LabStatusBadge.
  if (!hasLabsWarning(appointmentType, labStatus) || labStatus) return null;
  return (
    <StatusBadge
      tone="warning"
      icon={AlertTriangle}
      label="Nalazi nedostaju"
      title={LABS_WARNING_MESSAGE}
      className={className}
    />
  );
}
