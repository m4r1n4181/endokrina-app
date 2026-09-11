export type LockableAppointment = {
  status: string;
  scheduledAt: Date;
};

export function isAppointmentLocked(
  appointment: LockableAppointment,
  now: Date = new Date(),
): boolean {
  if (appointment.status === "cancelled") return true;
  if (appointment.status === "locked") return true;
  if (appointment.status === "reopened") return false;
  return appointment.scheduledAt <= now;
}
