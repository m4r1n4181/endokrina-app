/**
 * Shared status/lab badges (UX requirements, table 4 — dashboard status badges).
 * Every badge renders a Serbian label; raw enum values are never shown.
 * Used on the dashboard, appointment detail and patient history so the colours,
 * icons and wording stay consistent everywhere.
 */
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileCheck2,
  FolderInput,
  Hourglass,
  Lock,
  MailOpen,
  MinusCircle,
  RotateCcw,
  Send,
  XCircle,
  FileText,
} from 'lucide-react';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_MEANINGS,
  LAB_STATUS_LABELS,
  LAB_STATUS_MEANINGS,
  hasLabsWarning,
  labelFor,
} from '@/lib/labels';

const STATUS_STYLES: Record<string, string> = {
  draft_invitation: 'border-gray-200 bg-gray-50 text-gray-600',
  link_sent: 'border-gray-200 bg-gray-50 text-gray-700',
  opened: 'border-blue-200 bg-blue-50 text-blue-800',
  in_progress: 'border-blue-200 bg-blue-50 text-blue-800',
  submitted: 'border-green-200 bg-green-50 text-green-800',
  locked: 'border-primary/30 bg-primary/5 text-primary',
  reopened: 'border-blue-200 bg-blue-50 text-blue-800',
  rescheduled: 'border-amber-200 bg-amber-50 text-amber-800',
  cancelled: 'border-red-200 bg-red-50 text-red-700',
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

export function AppointmentStatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const Icon = STATUS_ICONS[status] ?? Clock;
  const meaning = APPOINTMENT_STATUS_MEANINGS[status];

  return (
    <Badge
      variant="outline"
      title={meaning}
      className={cn('gap-1', STATUS_STYLES[status] ?? 'border-gray-200 bg-gray-50 text-gray-600', className)}
    >
      <Icon size={12} aria-hidden="true" />
      {labelFor(APPOINTMENT_STATUS_LABELS, status)}
    </Badge>
  );
}

const LAB_STYLES: Record<string, string> = {
  uploaded_digitally: 'border-green-200 bg-green-50 text-green-800',
  will_bring_physical: 'border-blue-200 bg-blue-50 text-blue-800',
  results_pending: 'border-amber-200 bg-amber-50 text-amber-800',
  no_results_available: 'border-amber-200 bg-amber-50 text-amber-800',
  not_required: 'border-gray-200 bg-gray-50 text-gray-600',
};

const LAB_ICONS: Record<string, typeof Clock> = {
  uploaded_digitally: FileCheck2,
  will_bring_physical: FolderInput,
  results_pending: Hourglass,
  no_results_available: AlertTriangle,
  not_required: MinusCircle,
};

export function LabStatusBadge({
  labStatus,
  className,
}: {
  labStatus?: string | null;
  className?: string;
}) {
  if (!labStatus) return null;
  const Icon = LAB_ICONS[labStatus] ?? FileText;

  return (
    <Badge
      variant="outline"
      title={LAB_STATUS_MEANINGS[labStatus]}
      className={cn('gap-1', LAB_STYLES[labStatus] ?? 'border-gray-200 bg-gray-50 text-gray-600', className)}
    >
      <Icon size={12} aria-hidden="true" />
      {labelFor(LAB_STATUS_LABELS, labStatus)}
    </Badge>
  );
}

/**
 * "Strong warning" badge — labs (possibly) missing for an appointment type that needs them.
 * Copy is deliberately calm: it explains the consequence, it does not block anything.
 */
export function LabsWarningBadge({
  appointmentType,
  labStatus,
  className,
  variant = 'badge',
}: {
  appointmentType?: string | null;
  labStatus?: string | null;
  className?: string;
  variant?: 'badge' | 'inline';
}) {
  if (!hasLabsWarning(appointmentType, labStatus)) return null;

  const message =
    'Za ovaj tip pregleda obično su potrebni skoriji laboratorijski nalazi. Bez njih doktor možda neće moći da završi kompletnu procenu.';

  if (variant === 'inline') {
    return (
      <div className={cn('flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900', className)}>
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
        <div>
          <p className="font-medium">Upozorenje: nalazi možda nedostaju</p>
          <p className="text-amber-800">{message}</p>
        </div>
      </div>
    );
  }

  return (
    <Badge
      variant="outline"
      title={message}
      className={cn('gap-1 border-amber-300 bg-amber-50 text-amber-900', className)}
    >
      <AlertTriangle size={12} aria-hidden="true" />
      Nalazi nedostaju
    </Badge>
  );
}

export function InfoBadge({ label, className, ...props }: { label: string; className?: string } & BadgeProps) {
  return (
    <Badge variant="outline" className={cn('gap-1 border-gray-200 bg-gray-50 text-gray-700', className)} {...props}>
      {label}
    </Badge>
  );
}
