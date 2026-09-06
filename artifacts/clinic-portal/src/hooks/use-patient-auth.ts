import { useLocation } from 'wouter';
import { useCallback } from 'react';

export function usePatientAuth() {
  const [, setLocation] = useLocation();
  const patientToken = sessionStorage.getItem('patient_token');
  const appointmentId = sessionStorage.getItem('patient_appointment_id');
  const sessionId = sessionStorage.getItem('patient_session_id');

  const isAuthenticated = !!patientToken && !!appointmentId;

  const login = useCallback(({ patientToken, appointmentId }: { patientToken: string, appointmentId: string }) => {
    sessionStorage.setItem('patient_token', patientToken);
    sessionStorage.setItem('patient_appointment_id', appointmentId);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem('patient_token');
    sessionStorage.removeItem('patient_appointment_id');
    sessionStorage.removeItem('patient_session_id');
  }, []);

  return {
    patientToken,
    appointmentId,
    sessionId,
    isAuthenticated,
    login,
    logout,
  };
}
