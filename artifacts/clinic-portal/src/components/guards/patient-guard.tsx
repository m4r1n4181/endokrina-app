import { usePatientAuth } from '@/hooks/use-patient-auth';
import { useLocation, useParams } from 'wouter';
import { useEffect } from 'react';

export function PatientGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = usePatientAuth();
  const [, setLocation] = useLocation();
  const params = useParams();
  const token = params.token || '';

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation(`/prepare/${token}`);
    }
  }, [isAuthenticated, setLocation, token]);

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
