import { useStaffAuth } from '@/hooks/use-staff-auth';
import { useLocation } from 'wouter';
import { useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

export function StaffGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useStaffAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation('/login');
    }
  }, [isLoading, isAuthenticated, setLocation]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    );
  }

  return <>{children}</>;
}
